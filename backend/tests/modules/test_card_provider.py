"""Card provider selection (CARD_PROVIDER=stripe|safepay), Stage A of the SafePay work.

What must hold: Stripe stays the default and behaves as before; every other provider is
untouched; a NEW card payment records the provider it was made with; and every later step for
that payment (webhook, refund) goes to the RECORDED provider, never to whatever CARD_PROVIDER says
at that moment. SafePay itself does nothing yet (its contract is unverified), so it must refuse
safely: no payment started, no webhook confirming, no refund sent.
"""

from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import CardProvider, Environment, PaymentMode, SafepayEnvironment, get_settings
from app.core.exceptions import ServiceUnavailableError, ValidationError
from app.integrations import payments as providers
from app.integrations.payments import SafepayProvider, StripeProvider, get_provider
from app.integrations.payments.easypaisa import EasyPaisaProvider
from app.integrations.payments.jazzcash import JazzCashProvider
from app.integrations.payments.manual import ManualProvider
from app.integrations.payments.mock import MockProvider
from app.modules.payment import methods
from app.modules.payment import service as payment_service
from app.modules.payment.model import Payment, Refund
from tests.helpers import auth_header
from tests.modules.test_group_cancel import _paid_group

real = pytest.mark.real_gateway_rules  # the real providers, not the test stand-ins


def _use(monkeypatch: pytest.MonkeyPatch, **settings: object) -> None:
    for name, value in settings.items():
        monkeypatch.setattr(get_settings(), name, value)


# ---- selection ---------------------------------------------------------------------------


@real
def test_stripe_is_the_default_card_provider() -> None:
    assert get_settings().card_provider == CardProvider.stripe
    assert isinstance(get_provider("card"), StripeProvider)
    assert isinstance(get_provider("stripe"), StripeProvider)


@real
def test_the_other_providers_are_unchanged_whatever_the_card_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for choice in (CardProvider.stripe, CardProvider.safepay):
        _use(monkeypatch, card_provider=choice)
        assert isinstance(get_provider("jazzcash"), JazzCashProvider)
        assert isinstance(get_provider("easypaisa"), EasyPaisaProvider)
        assert isinstance(get_provider("bank_transfer"), ManualProvider)
        assert isinstance(get_provider("manual"), ManualProvider)


@real
def test_card_goes_to_safepay_only_for_a_new_payment_and_only_when_selected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use(monkeypatch, card_provider=CardProvider.safepay)
    assert isinstance(get_provider("card"), SafepayProvider)  # a new card payment
    # a payment already made with Stripe still resolves to Stripe, by its recorded name
    assert isinstance(get_provider("stripe"), StripeProvider)
    assert isinstance(get_provider("safepay"), SafepayProvider)


def test_in_mock_mode_the_gateway_names_all_resolve_to_the_mock(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use(monkeypatch, payment_mode=PaymentMode.mock, card_provider=CardProvider.safepay)
    assert isinstance(get_provider("card"), MockProvider)
    assert isinstance(get_provider("safepay"), MockProvider)
    assert isinstance(get_provider("stripe"), MockProvider)
    assert isinstance(get_provider("bank_transfer"), ManualProvider)


@real
def test_an_unknown_provider_name_is_still_refused() -> None:
    with pytest.raises(ValueError):
        get_provider("nonsense")


# ---- SafePay refuses safely until its contract is verified -----------------------------------


async def test_safepay_does_not_start_a_payment_yet() -> None:
    with pytest.raises(ServiceUnavailableError):
        await SafepayProvider().initiate(
            amount=Decimal("1000"), currency="PKR", reference="g", return_url=None
        )


def test_safepay_confirms_nothing_from_a_webhook_yet() -> None:
    with pytest.raises(ValidationError):
        SafepayProvider().verify_webhook(b"{}", {"x-sfpy-signature": "00"})


async def test_safepay_sends_no_refund_yet() -> None:
    with pytest.raises(ServiceUnavailableError):
        await SafepayProvider().refund(gateway_transaction_id="track_x", amount=Decimal("1"))


# ---- availability shown to the apps -------------------------------------------------------------


@real
def test_default_method_list_still_names_stripe_as_the_card_provider() -> None:
    card = next(m for m in methods.list_methods() if m["method"] == "card")
    assert card["key"] == "stripe"
    assert card["label"] == "Card"


@real
def test_safepay_card_is_unavailable_until_configured_and_switched_on(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use(monkeypatch, card_provider=CardProvider.safepay)
    assert methods.method_state(methods.PaymentMethod.card) == methods.UNAVAILABLE
    _use(
        monkeypatch,
        safepay_api_key="public-key-for-test",
        safepay_secret_key="secret-key-for-test",
        safepay_webhook_secret="webhook-secret-for-test",
    )
    assert (
        methods.method_state(methods.PaymentMethod.card) == methods.UNAVAILABLE
    )  # not switched on
    _use(monkeypatch, safepay_checkout_enabled=True)
    assert methods.method_state(methods.PaymentMethod.card) == methods.AVAILABLE
    card = next(m for m in methods.list_methods() if m["method"] == "card")
    assert card["key"] == "safepay"


# ---- configuration ---------------------------------------------------------------------------


def test_safepay_is_configured_only_with_all_three_real_looking_values(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    s = get_settings()
    assert s.safepay_configured is False
    _use(monkeypatch, safepay_api_key="public-key-for-test", safepay_secret_key="secret-for-test")
    assert s.safepay_configured is False  # no webhook secret
    _use(monkeypatch, safepay_webhook_secret="xxx-placeholder-xxx")
    assert s.safepay_configured is False  # a placeholder is not a secret
    _use(monkeypatch, safepay_webhook_secret="webhook-secret-for-test")
    assert s.safepay_configured is True


def test_safepay_host_follows_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    s = get_settings()
    assert s.safepay_env == SafepayEnvironment.sandbox
    assert s.safepay_base_url == "https://sandbox.api.getsafepay.com"
    _use(monkeypatch, safepay_env=SafepayEnvironment.production)
    assert s.safepay_base_url == "https://api.getsafepay.com"


def test_choosing_safepay_in_production_needs_its_keys_and_the_production_host() -> None:
    prod = get_settings().model_copy(
        update={"environment": Environment.prod, "card_provider": CardProvider.safepay}
    )
    problems = " ".join(prod.production_problems())
    assert "CARD_PROVIDER=safepay needs SAFEPAY_API_KEY" in problems
    assert "SAFEPAY_ENV must be production" in problems
    stripe = get_settings().model_copy(update={"environment": Environment.prod})
    assert "SAFEPAY" not in " ".join(stripe.production_problems())  # Stripe default: no demands


# ---- the recorded provider decides everything after the payment exists --------------------


async def test_a_new_card_payment_records_the_provider_it_was_made_with(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    player, group, payment, _, _ = await _paid_group(client, db_session, "cp1")
    assert payment["payment_provider"] == "stripe"  # the default
    # now Stripe is switched out for SafePay (mock mode: nothing real is called)
    _use(monkeypatch, payment_mode=PaymentMode.mock, card_provider=CardProvider.safepay)
    again = await _paid_group(client, db_session, "cp2")
    assert again[2]["payment_provider"] == "safepay"
    assert payment["payment_provider"] == "stripe"  # the first one keeps its own record


@real
async def test_safepay_refuses_to_start_a_payment_and_leaves_no_payment_behind(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setitem(providers._LIVE_PROVIDERS, "card", MockProvider("card"))
    # a booking waiting for payment (built by the shared helper, then not paid)
    owner_made = await _paid_group(client, db_session, "cp3")
    player = owner_made[0]
    # a second, still-unpaid booking for the same player
    from tests.modules.test_payment import _slots

    court_id, monday = owner_made[3], owner_made[4]
    slots = await _slots(client, court_id, monday)
    free = next(s for s in slots if s["status"] == "available")
    made = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [free["id"]], "payment_type": "full"},
    )
    group_id = made.json()["data"]["booking_group_id"]
    before = await db_session.scalar(select(func.count()).select_from(Payment))

    _use(
        monkeypatch,
        card_provider=CardProvider.safepay,
        safepay_api_key="public-key-for-test",
        safepay_secret_key="secret-key-for-test",
        safepay_webhook_secret="webhook-secret-for-test",
        safepay_checkout_enabled=True,
    )
    res = await client.post(
        "/api/v1/payments/initiate",
        headers=auth_header(player),
        json={"booking_group_id": group_id, "payment_method": "card"},
    )
    assert res.status_code == 503, res.text
    assert await db_session.scalar(select(func.count()).select_from(Payment)) == before


async def test_a_safepay_webhook_cannot_confirm_a_booking_yet(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    res = await client.post(
        "/api/v1/webhooks/safepay",
        content=b'{"type":"payment.succeeded"}',
        headers={"X-SFPY-SIGNATURE": "00", "Content-Type": "application/json"},
    )
    assert res.status_code == 422


async def test_a_refund_goes_to_the_provider_recorded_on_the_payment(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    player, group, payment, _, _ = await _paid_group(client, db_session, "cp4")
    assert payment["payment_provider"] == "stripe"
    asked: list[str] = []
    original = payment_service.get_provider

    def spy(key: str):  # type: ignore[no-untyped-def]
        asked.append(key)
        return original(key)

    monkeypatch.setattr(payment_service, "get_provider", spy)
    _use(monkeypatch, card_provider=CardProvider.safepay)  # switched AFTER the payment was made

    res = await client.post(
        f"/api/v1/bookings/group/{group['booking_group_id']}/cancel",
        headers=auth_header(player),
        json={},
    )
    assert res.status_code == 200, res.text
    refunds = (
        (await db_session.execute(select(Refund).where(Refund.payment_id == payment["id"])))
        .scalars()
        .all()
    )
    assert len(refunds) == 1
    assert asked == ["stripe"]  # never "card", never "safepay"
