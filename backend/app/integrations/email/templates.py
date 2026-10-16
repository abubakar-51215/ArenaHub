"""Branded HTML email templates (plain-text fallback is composed alongside).

Layout is table-based with inline styles, because email clients ignore most
CSS. A small <style> block adds dark-mode colours for clients that honour
``prefers-color-scheme``; the inline colours are the light-mode defaults, so
clients that strip the block still render correctly.

Brand: ink #0F1A15 header band on paper #F1F2EF, a white card, Archivo for
headings with system fonts as fallbacks, and the code in an ink box with lime
digits. Each helper returns ``(subject, text_body, html_body)`` ready for
``send_email``.
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

HEADING_FONT = "Archivo,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
BODY_FONT = "'Inter Tight','Segoe UI',Roboto,Helvetica,Arial,sans-serif"
MONO_FONT = "Consolas,'SFMono-Regular',Menlo,'Courier New',monospace"

# Zero-width padding after the preview text so that the first words of the
# body do not get pulled into the inbox preview line.
_PREHEADER_PAD = "&#847;&zwnj;&nbsp;" * 40


def _badge() -> str:
    """The 40 px ArenaHub badge above the title (the 80 px file, shown at 40 for sharp screens)."""
    src = f"{get_settings().web_public_url.rstrip('/')}/brand/email-badge@2x.png"
    return (
        f'<img src="{html_lib.escape(src)}" width="40" height="40" alt="ArenaHub" '
        'style="display:block;width:40px;height:40px;border:0;margin:0 0 16px;border-radius:10px;">'
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


def _heading(text: str) -> str:
    return (
        f'<p class="ah-text" style="margin:0 0 10px;font-family:{HEADING_FONT};font-size:22px;'
        f'font-weight:800;line-height:1.25;color:{INK};">{text}</p>'
    )


def _code_box(code: str) -> str:
    # Ink box, lime digits: high contrast in both light and dark mode, and it
    # does not change under dark-mode colour inversion.
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
CODE_IGNORE_LINE = "If you did not ask for this, you can ignore this email."


def code_email(code: str, purpose: str, ttl_minutes: int) -> tuple[str, str, str]:
    """A 6-digit code email: the subject names the code, the code is large and selectable
    text (not an image), it says how long it works, and what it is for. No links, no remote
    images (nothing to track), no support address, no raw keys."""
    what = CODE_PURPOSE_WORDS.get(purpose, "Your code")
    works = f"It works for {ttl_minutes} minutes."
    subject = f"Your {BRAND} code: {code}"
    text = (
        f"{what}\n\n"
        f"Your {BRAND} code: {code}\n\n"
        f"{works} It can be used once.\n\n"
        f"{CODE_IGNORE_LINE}\n\n"
        f"{BRAND}"
    )
    html = _layout(
        subject,
        f"{what}. {works}",
        f"""\
{_heading(html_lib.escape(what))}
<p class="ah-text" style="margin:0;">Your {BRAND} code:</p>
{_code_box(code)}
<p class="ah-text" style="margin:0 0 8px;">{html_lib.escape(works)} It can be used once.</p>""",
        badge=False,
        footer=html_lib.escape(CODE_IGNORE_LINE),
    )
    return subject, text, html


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


def _login_alert_email(
    lines: tuple[str, str, str, str], support_email: str
) -> tuple[str, str, str]:
    """Build the (subject, text, page) of a login-alert email from its four lines.
    No images, no tracking; the only link is a mailto to support. The name is escaped."""
    subject = messages.OWNER_LOGIN_SUBJECT
    greeting, happened, advice, thanks = lines
    sep = chr(10) * 2
    text = sep.join((greeting, happened, advice, thanks)) + chr(10)
    safe_support = html_lib.escape(support_email, quote=True)
    advice_html = html_lib.escape(advice).replace(
        html_lib.escape(support_email),
        f'<a href="mailto:{safe_support}" style="color:{INK};font-weight:700;">{safe_support}</a>',
    )
    body = (
        _heading("ArenaHub login alert")
        + f'<p class="ah-text" style="margin:0 0 12px;">{html_lib.escape(greeting)}</p>'
        + f'<p class="ah-text" style="margin:0 0 12px;">{html_lib.escape(happened)}</p>'
        + f'<p class="ah-text" style="margin:0 0 12px;">{advice_html}</p>'
        + '<p class="ah-text" style="margin:0;">Thank you,<br>ArenaHub</p>'
    )
    html = _layout(
        subject,
        happened,
        body,
        badge=False,
        footer="This message was sent to the email address of your account.",
    )
    return subject, text, html


def owner_login_alert_email(name: str, when_text: str, support_email: str) -> tuple[str, str, str]:
    """Login-alert email for an arena owner, sent after each new sign-in."""
    lines = messages.owner_login_alert_lines(name, when_text, support_email)
    return _login_alert_email(lines, support_email)


def player_login_alert_email(name: str, when_text: str, support_email: str) -> tuple[str, str, str]:
    """Login-alert email for a player, sent after each new sign-in."""
    lines = messages.player_login_alert_lines(name, when_text, support_email)
    return _login_alert_email(lines, support_email)


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
