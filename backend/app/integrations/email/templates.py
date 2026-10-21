"""Branded HTML email templates (plain-text fallback is composed alongside).

Layout is table-based with inline styles, because email clients ignore most
CSS. A small <style> block adds dark-mode colours for clients that honour
``prefers-color-scheme``; the inline colours are the light-mode defaults, so
clients that strip the block still render correctly.

Brand: ink #0F1A15 header band on paper #F1F2EF, a white card, Archivo for
headings with system fonts as fallbacks, and the code in an ink box with lime
digits. Each helper returns ``(subject, text_body, html_body)`` ready for
``send_email``.

Three restyled layouts share one base (``_shell`` + the dark-mode style block
+ ``_badge``/``_code_box``) and are used by every code/alert email:
  * Layout A (``login_alert_email``) — the player/owner sign-in alert.
  * Layout B (``code_email``) — every emailed code except password reset.
  * Layout C (``password_reset_email``) — password reset, the only code email
    whose code is the sole way to continue (no button, no reset link).
``notification_email``/``email_changed_email``/``password_changed_email`` are
unchanged (no mockup was given for them in the restyle round) and keep using
the older ``_layout`` at 480px.
"""

import html as html_lib
from datetime import datetime

from app.core import messages
from app.core.messages import email_changed_notice, password_changed_notice

BRAND = "ArenaHub"
INK = "#0F1A15"
PAPER = "#F1F2EF"
LIME = "#C4F546"
LINE = "#E2E6E1"
MUTED = "#656F69"  # 4.5:1 or more on white and paper (was #79857E, 3.4:1)
GREY_TOP = "#EDEFEB"  # Layout B's light grey top bar
AMBER_WASH = "#FDF3DC"
AMBER_TEXT = "#956508"  # 4.59:1 on AMBER_WASH (docs/BEFORE_GOING_LIVE.md, decided 2026-10-13)

HEADING_FONT = "Archivo,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
BODY_FONT = "'Inter Tight','Segoe UI',Roboto,Helvetica,Arial,sans-serif"
MONO_FONT = "Consolas,'SFMono-Regular',Menlo,'Courier New',monospace"

RESTYLE_WIDTH = 600  # Layouts A/B/C. The older _layout() below stays at 480px.

# Zero-width padding after the preview text so that the first words of the
# body do not get pulled into the inbox preview line.
_PREHEADER_PAD = "&#847;&zwnj;&nbsp;" * 40


# The 80px badge file (frontend/web/public/brand/email-badge@2x.png), inlined as a data URI so
# it always renders — a mail client can never reach WEB_PUBLIC_URL (it is the dev-only localhost
# default until a real web address is decided at go-live; see docs/BEFORE_GOING_LIVE.md), and an
# inline image also skips the "show images?" prompt plenty of clients put in front of a remote one.
_BADGE_DATA_URI = "data:image/png;base64,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"  # noqa: E501


def _badge(*, centered: bool = False) -> str:
    """The 40 px ArenaHub badge (the 80 px file, shown at 40 for sharp screens, inlined — see
    _BADGE_DATA_URI). ``alt`` is the text fallback shown when images are blocked."""
    margin = "0 auto 16px" if centered else "0 0 16px"
    return (
        f'<img src="{_BADGE_DATA_URI}" width="40" height="40" alt="ArenaHub" '
        f'style="display:block;width:40px;height:40px;border:0;margin:{margin};border-radius:10px;">'
    )


def _layout(
    title: str,
    preheader: str,
    content_html: str,
    *,
    badge: bool = True,
    footer: str = "If you didn&rsquo;t request this email, you can safely ignore it.",
) -> str:
    if badge:
        content_html = _badge() + content_html
    return f"""\
<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>{html_lib.escape(title)}</title>
    <style>
      :root {{ color-scheme: light dark; supported-color-schemes: light dark; }}
      @media (prefers-color-scheme: dark) {{
        .ah-bg {{ background-color: #0B1310 !important; }}
        .ah-card {{ background-color: #16231C !important; border-color: #26362D !important; }}
        .ah-text {{ color: #E8EEEA !important; }}
        .ah-muted {{ color: #8FA096 !important; }}
        .ah-line {{ border-color: #26362D !important; }}
      }}
    </style>
  </head>
  <body class="ah-bg" style="margin:0;padding:0;background-color:{PAPER};">
    <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;
                opacity:0;overflow:hidden;mso-hide:all;">{html_lib.escape(preheader)}{_PREHEADER_PAD}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           class="ah-bg" style="background-color:{PAPER};">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="max-width:480px;">
            <tr>
              <td style="background-color:{INK};border-radius:14px 14px 0 0;padding:22px 32px;">
                <span style="font-family:{HEADING_FONT};font-size:20px;font-weight:800;
                             letter-spacing:0.04em;color:#ffffff;">ARENA</span>
                <span style="font-family:{HEADING_FONT};font-size:20px;font-weight:800;
                             letter-spacing:0.04em;color:{LIME};">HUB</span>
              </td>
            </tr>
            <tr>
              <td class="ah-card ah-text"
                  style="background-color:#ffffff;border:1px solid {LINE};border-top:0;
                         padding:30px 32px;font-family:{BODY_FONT};color:{INK};
                         font-size:15px;line-height:1.6;">
                {content_html}
              </td>
            </tr>
            <tr>
              <td class="ah-card ah-line ah-muted"
                  style="background-color:#ffffff;border:1px solid {LINE};
                         border-radius:0 0 14px 14px;padding:16px 32px;font-family:{BODY_FONT};
                         color:{MUTED};font-size:12px;line-height:1.5;">
                {BRAND} &mdash; sports arena booking platform for Pakistan.<br>
                {footer}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""


def _heading(text: str, *, centered: bool = False) -> str:
    align = "text-align:center;" if centered else ""
    return (
        f'<p class="ah-text" style="margin:0 0 10px;{align}'
        f"font-family:{HEADING_FONT};font-size:22px;"
        f'font-weight:800;line-height:1.25;color:{INK};">{text}</p>'
    )


def _code_box(code: str) -> str:
    # Ink box, lime digits: high contrast in both light and dark mode, and it
    # does not change under dark-mode colour inversion. letter-spacing (not literal
    # spaces) puts visible gaps between the digits while keeping the copyable text
    # exactly the code — a real space would have to be stripped before it works.
    return f"""\
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="margin:22px 0;">
  <tr>
    <td align="center" bgcolor="{INK}"
        style="background-color:{INK};border-radius:12px;padding:20px 12px;">
      <span style="font-family:{MONO_FONT};font-size:36px;font-weight:700;
                   letter-spacing:10px;color:{LIME};-webkit-user-select:all;user-select:all;"
            >{html_lib.escape(code)}</span>
    </td>
  </tr>
</table>"""


# What each emailed code is for, in plain words (the same words in the HTML and the text).
CODE_PURPOSE_WORDS = {
    "registration": "Confirm your email",
    "admin_login": "Sign in as admin",
    "password_reset": "Reset your password",
    "password_change": "Confirm your new password",
    "email_change": "Confirm your new email",
    "phone_change": "Confirm your new phone number",
    "account_deletion": "Confirm deleting your account",
    "bank_details_change": "Confirm your bank account change",
}


def _notice_email(subject: str, body: str, footer: str) -> tuple[str, str, str]:
    """A plain notice: the subject and the paragraphs of ``body``; no links, no images, no address
    of anybody. The wording is kept in app/core/messages.py."""
    sep = chr(10) * 2
    paragraphs = [p for p in body.split(sep) if p.strip()]
    text = f"{subject}{sep}" + sep.join(paragraphs) + f"{sep}{BRAND}"
    inner = "".join(
        f'<p class="ah-text" style="margin:0 0 8px;">{html_lib.escape(p)}</p>' for p in paragraphs
    )
    heading = subject.replace(f"Your {BRAND} ", "Your ")
    html = _layout(
        subject,
        paragraphs[0],
        _heading(html_lib.escape(heading[:1].upper() + heading[1:])) + inner,
        badge=False,
        footer=footer,
    )
    return subject, text, html


def email_changed_email(new_masked: str, when: datetime) -> tuple[str, str, str]:
    """Sent to the OLD address after a change of email is confirmed."""
    subject, body = email_changed_notice(new_masked, when)
    return _notice_email(subject, body, "This message was sent to your previous email address.")


def password_changed_email(when: datetime) -> tuple[str, str, str]:
    """Sent to the account's address after a password change."""
    subject, body = password_changed_notice(when)
    return _notice_email(
        subject, body, "This message was sent to the email address of your account."
    )


def notification_email(title: str, body: str) -> tuple[str, str, str]:
    """``title``/``body`` come from ``notification/service.py``'s templates,
    which interpolate caller-supplied strings (e.g. an admin's suspension
    reason) — escaped before going into HTML so that content can't inject
    markup/script into the rendered email."""
    subject = f"{BRAND} — {title}"
    text = f"{title}\n\n{body}"
    safe_title = html_lib.escape(title)
    safe_body = html_lib.escape(body)
    html = _layout(
        subject,
        body[:90],
        f"""\
{_heading(safe_title)}
<p class="ah-text" style="margin:0;">{safe_body}</p>""",
    )
    return subject, text, html


# =============================================================================================
# Restyled layouts (A/B/C): one shared shell at 600px, a dark-mode style block covering every
# piece used below, and three distinct header bands (each layout keeps its own look).
# =============================================================================================


def _shell(title: str, preheader: str, header_row: str, body_html: str, footer_text: str) -> str:
    return f"""\
<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>{html_lib.escape(title)}</title>
    <style>
      :root {{ color-scheme: light dark; supported-color-schemes: light dark; }}
      @media (prefers-color-scheme: dark) {{
        .ah-bg {{ background-color: #0B1310 !important; }}
        .ah-card {{ background-color: #16231C !important; border-color: #26362D !important; }}
        .ah-text {{ color: #E8EEEA !important; }}
        .ah-muted {{ color: #8FA096 !important; }}
        .ah-line {{ border-color: #26362D !important; }}
        .ah-grey-top {{ background-color: #1C2A22 !important; }}
        .ah-pill {{ background-color: #2A3D22 !important; }}
        .ah-pill-text {{ color: #C4F546 !important; }}
        .ah-warn {{ background-color: #2E2410 !important; }}
        .ah-warn-text {{ color: #FBD98B !important; }}
      }}
    </style>
  </head>
  <body class="ah-bg" style="margin:0;padding:0;background-color:{PAPER};">
    <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;
                opacity:0;overflow:hidden;mso-hide:all;">{html_lib.escape(preheader)}{_PREHEADER_PAD}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           class="ah-bg" style="background-color:{PAPER};">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="max-width:{RESTYLE_WIDTH}px;">
            {header_row}
            <tr>
              <td class="ah-card ah-text"
                  style="background-color:#ffffff;border:1px solid {LINE};border-top:0;
                         padding:30px 32px;font-family:{BODY_FONT};color:{INK};
                         font-size:15px;line-height:1.6;">
                {body_html}
              </td>
            </tr>
            <tr>
              <td class="ah-card ah-line ah-muted"
                  style="background-color:#ffffff;border:1px solid {LINE};
                         border-radius:0 0 14px 14px;padding:16px 32px;font-family:{BODY_FONT};
                         color:{MUTED};font-size:12px;line-height:1.5;">
                {BRAND} &mdash; sports arena booking platform for Pakistan.<br>
                {footer_text}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""


def _header_ink() -> str:
    """Layout A: the dark ink band with the ARENA/HUB wordmark — text, not an image, so it
    always renders even with images blocked (the strongest possible "text fallback")."""
    return f"""\
    <tr>
      <td style="background-color:{INK};border-radius:14px 14px 0 0;padding:22px 32px;">
        <span style="font-family:{HEADING_FONT};font-size:20px;font-weight:800;
                     letter-spacing:0.04em;color:#ffffff;">ARENA</span>
        <span style="font-family:{HEADING_FONT};font-size:20px;font-weight:800;
                     letter-spacing:0.04em;color:{LIME};">HUB</span>
      </td>
    </tr>"""


def _header_grey_centered_logo() -> str:
    """Layout B: a light grey top bar with the logo centred."""
    return f"""\
    <tr>
      <td align="center" class="ah-grey-top"
          style="background-color:{GREY_TOP};border-radius:14px 14px 0 0;padding:22px 32px;">
        {_badge(centered=True)}
      </td>
    </tr>"""


def _header_logo_left() -> str:
    """Layout C: the logo at the top, left-aligned, no coloured band."""
    return f"""\
    <tr>
      <td class="ah-card" style="background-color:#ffffff;border:1px solid {LINE};
                 border-bottom:0;border-radius:14px 14px 0 0;padding:26px 32px 0;">
        {_badge()}
      </td>
    </tr>"""


def _pill_badge(text: str) -> str:
    """Layout A's small "NEW SIGN-IN" badge, under the header bar."""
    return (
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" '
        'style="margin:0 0 14px;"><tr>'
        f'<td class="ah-pill" bgcolor="#EAF7C8" '
        f'style="background-color:#EAF7C8;border-radius:999px;padding:4px 12px;">'
        f'<span class="ah-pill-text" style="font-family:{HEADING_FONT};font-size:11px;'
        f'font-weight:800;letter-spacing:0.08em;color:{INK};">'
        f"{html_lib.escape(text, quote=False)}</span>"
        "</td></tr></table>"
    )


def _details_table(rows: list[tuple[str, str]]) -> str:
    """Layout A's Name/Account/Role/Date and time/Signed in with/Device/IP address table."""
    trs = "".join(
        "<tr>"
        f'<td class="ah-muted ah-line" style="padding:8px 0;border-bottom:1px solid {LINE};'
        f'font-family:{BODY_FONT};font-size:13px;color:{MUTED};width:42%;vertical-align:top;">'
        f"{html_lib.escape(label, quote=False)}</td>"
        f'<td class="ah-text ah-line" style="padding:8px 0;border-bottom:1px solid {LINE};'
        f"font-family:{BODY_FONT};font-size:13px;font-weight:600;color:{INK};text-align:right;"
        f'word-break:break-word;">{html_lib.escape(value, quote=False)}</td>'
        "</tr>"
        for label, value in rows
    )
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="margin:18px 0;">{trs}</table>'
    )


def _warning_box(heading: str, body_html: str) -> str:
    """Layout A's "Not you?" box: approved change-password-and-contact-support wording."""
    return f"""\
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="margin:20px 0 4px;">
  <tr>
    <td class="ah-warn" bgcolor="{AMBER_WASH}"
        style="background-color:{AMBER_WASH};border-radius:10px;padding:16px 18px;">
      <p class="ah-warn-text" style="margin:0 0 6px;font-family:{HEADING_FONT};font-size:14px;
                font-weight:800;color:{AMBER_TEXT};">{html_lib.escape(heading, quote=False)}</p>
      <p class="ah-warn-text" style="margin:0;font-family:{BODY_FONT};font-size:13px;
                line-height:1.55;color:{AMBER_TEXT};">{body_html}</p>
    </td>
  </tr>
</table>"""


def _mailto(support_email: str, text: str) -> str:
    """``text`` (already escaped with ``quote=False``, matching the body-text escapes below) with
    the support address turned into a mailto link — the only kind of link this restyle allows
    besides the logo."""
    safe_attr = html_lib.escape(support_email, quote=True)  # for the href="" attribute
    safe_text = html_lib.escape(support_email, quote=False)  # to find it inside the body text
    return text.replace(
        safe_text,
        f'<a href="mailto:{safe_attr}" style="color:{INK};font-weight:700;">{safe_text}</a>',
    )


def login_alert_email(
    *,
    is_owner: bool,
    name: str,
    account: str,
    when_text: str,
    signed_in_with: str,
    device: str,
    ip: str,
    support_email: str,
) -> tuple[str, str, str]:
    """Layout A: the login-alert email, sent to a player or an arena owner after a real sign-in."""
    lines = (
        messages.owner_login_alert_lines(name, when_text, support_email)
        if is_owner
        else messages.player_login_alert_lines(name, when_text, support_email)
    )
    greeting, happened, advice, thanks = lines
    subject = messages.OWNER_LOGIN_SUBJECT
    role_label = "Owner" if is_owner else "Player"
    when_full = f"{when_text} (Pakistan time)"
    rows = [
        (messages.LOGIN_ALERT_LABEL_NAME, name),
        (messages.LOGIN_ALERT_LABEL_ACCOUNT, account),
        (messages.LOGIN_ALERT_LABEL_ROLE, role_label),
        (messages.LOGIN_ALERT_LABEL_WHEN, when_full),
        (messages.LOGIN_ALERT_LABEL_SIGNED_IN_WITH, signed_in_with),
        (messages.LOGIN_ALERT_LABEL_DEVICE, device),
        (messages.LOGIN_ALERT_LABEL_IP, ip),
    ]
    sep = chr(10) * 2
    text = sep.join(
        [greeting, happened] + [f"{label}: {value}" for label, value in rows] + [advice, thanks]
    ) + chr(10)
    advice_html = _mailto(support_email, html_lib.escape(advice, quote=False))
    body_html = (
        _pill_badge(messages.LOGIN_ALERT_BADGE)
        + _heading(html_lib.escape(messages.LOGIN_ALERT_TITLE, quote=False))
        + '<p class="ah-text" style="margin:0 0 6px;">'
        + f"{html_lib.escape(greeting, quote=False)}</p>"
        + '<p class="ah-text" style="margin:0 0 4px;">'
        + f"{html_lib.escape(happened, quote=False)}</p>"
        + _details_table(rows)
        + _warning_box(messages.LOGIN_ALERT_NOT_YOU_HEADING, advice_html)
        + '<p class="ah-text" style="margin:16px 0 0;">'
        + f'{html_lib.escape(thanks, quote=False).replace(chr(10), "<br>")}</p>'
    )
    html = _shell(
        subject,
        happened,
        _header_ink(),
        body_html,
        "This message was sent to the email address of your account.",
    )
    return subject, text, html


def owner_login_alert_email(
    name: str,
    account: str,
    when_text: str,
    signed_in_with: str,
    device: str,
    ip: str,
    support_email: str,
) -> tuple[str, str, str]:
    """Login-alert email for an arena owner, sent after each new sign-in."""
    return login_alert_email(
        is_owner=True,
        name=name,
        account=account,
        when_text=when_text,
        signed_in_with=signed_in_with,
        device=device,
        ip=ip,
        support_email=support_email,
    )


def player_login_alert_email(
    name: str,
    account: str,
    when_text: str,
    signed_in_with: str,
    device: str,
    ip: str,
    support_email: str,
) -> tuple[str, str, str]:
    """Login-alert email for a player, sent after each new sign-in."""
    return login_alert_email(
        is_owner=False,
        name=name,
        account=account,
        when_text=when_text,
        signed_in_with=signed_in_with,
        device=device,
        ip=ip,
        support_email=support_email,
    )


def code_email(
    code: str, purpose: str, ttl_minutes: int, name: str | None = None
) -> tuple[str, str, str]:
    """Layout B: a 6-digit code email for every purpose except password reset (see
    ``password_reset_email`` for Layout C). The subject names the code; the code is large,
    selectable text (not an image); no links, no support address, no raw keys."""
    what = CODE_PURPOSE_WORDS.get(purpose, "Your code")
    explain = messages.CODE_EXPLANATION_WORDS.get(purpose, "Use this code to continue.")
    greeting = (
        messages.CODE_GREETING_NAMED.format(name=name) if name else messages.CODE_GREETING_BARE
    )
    valid_line = messages.CODE_VALID_LINE.format(minutes=ttl_minutes)
    subject = f"Your {BRAND} code: {code}"
    sep = chr(10) * 2
    text = sep.join(
        (
            what,
            greeting,
            explain,
            f"Your {BRAND} code: {code}",
            valid_line,
            messages.CODE_DO_NOT_SHARE,
            messages.CODE_IGNORE_SHORT_LINE,
            BRAND,
        )
    ) + chr(10)
    body_html = (
        _heading(html_lib.escape(what, quote=False), centered=True)
        + '<p class="ah-text" style="margin:0 0 10px;text-align:center;">'
        + f"{html_lib.escape(greeting, quote=False)}</p>"
        + '<p class="ah-text" style="margin:0 0 16px;text-align:center;">'
        + f"{html_lib.escape(explain, quote=False)}</p>"
        + _code_box(code)
        + '<p class="ah-text" style="margin:16px 0 6px;text-align:center;">'
        + f"{html_lib.escape(valid_line, quote=False)}</p>"
        + '<p class="ah-text" style="margin:0 0 6px;text-align:center;">'
        + f"{html_lib.escape(messages.CODE_DO_NOT_SHARE, quote=False)}</p>"
        + '<p class="ah-muted" style="margin:14px 0 0;text-align:center;font-size:12px;">'
        + f"{html_lib.escape(messages.CODE_IGNORE_SHORT_LINE, quote=False)}</p>"
    )
    html = _shell(
        subject,
        f"{what}. {valid_line}",
        _header_grey_centered_logo(),
        body_html,
        "This message was sent to the email address of your account.",
    )
    return subject, text, html


def password_reset_email(
    code: str, ttl_minutes: int, name: str | None, support_email: str
) -> tuple[str, str, str]:
    """Layout C: password reset. Left-aligned. The emailed code stays the only way to reset —
    no button, no reset link; the only link is the support mailto."""
    greeting = (
        messages.RESET_GREETING_NAMED.format(name=name) if name else messages.RESET_GREETING_BARE
    )
    valid_line = messages.CODE_VALID_LINE.format(minutes=ttl_minutes)
    help_line = messages.RESET_HELP_LINE.format(support_email=support_email)
    heading = CODE_PURPOSE_WORDS["password_reset"]
    subject = f"Your {BRAND} code: {code}"
    sep = chr(10) * 2
    text = sep.join(
        (
            heading,
            greeting,
            messages.RESET_EXPLANATION,
            f"Your {BRAND} code: {code}",
            valid_line,
            messages.CODE_IGNORE_SHORT_LINE,
            help_line,
            messages.RESET_SIGN_OFF,
        )
    ) + chr(10)
    help_html = _mailto(support_email, html_lib.escape(help_line, quote=False))
    body_html = (
        _heading(html_lib.escape(heading, quote=False))
        + '<p class="ah-text" style="margin:0 0 10px;">'
        + f"{html_lib.escape(greeting, quote=False)}</p>"
        + '<p class="ah-text" style="margin:0 0 16px;">'
        + f"{html_lib.escape(messages.RESET_EXPLANATION, quote=False)}</p>"
        + _code_box(code)
        + '<p class="ah-text" style="margin:16px 0 6px;">'
        + f"{html_lib.escape(valid_line, quote=False)}</p>"
        + '<p class="ah-text" style="margin:0 0 14px;">'
        + f"{html_lib.escape(messages.CODE_IGNORE_SHORT_LINE, quote=False)}</p>"
        + f'<p class="ah-text" style="margin:0 0 16px;">{help_html}</p>'
        + '<p class="ah-text" style="margin:0;">'
        + f'{html_lib.escape(messages.RESET_SIGN_OFF, quote=False).replace(chr(10), "<br>")}</p>'
    )
    html = _shell(
        subject,
        f"{heading}. {valid_line}",
        _header_logo_left(),
        body_html,
        "This message was sent because a password reset was requested for this address.",
    )
    return subject, text, html
