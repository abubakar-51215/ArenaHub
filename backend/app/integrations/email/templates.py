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
from app.core.config import get_settings
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


def _badge(*, centered: bool = False) -> str:
    """The 40 px ArenaHub badge (the 80 px file, shown at 40 for sharp screens). ``alt`` is the
    text fallback shown when images are blocked."""
    src = f"{get_settings().web_public_url.rstrip('/')}/brand/email-badge@2x.png"
    margin = "0 auto 16px" if centered else "0 0 16px"
    return (
        f'<img src="{html_lib.escape(src)}" width="40" height="40" alt="ArenaHub" '
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
        html_lib.escape(messages.CODE_IGNORE_SHORT_LINE, quote=False),
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
