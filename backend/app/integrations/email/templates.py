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

BRAND = "ArenaHub"
INK = "#0F1A15"
PAPER = "#F1F2EF"
LIME = "#C4F546"
LINE = "#E2E6E1"
MUTED = "#79857E"

HEADING_FONT = "Archivo,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
BODY_FONT = "'Inter Tight','Segoe UI',Roboto,Helvetica,Arial,sans-serif"
MONO_FONT = "Consolas,'SFMono-Regular',Menlo,'Courier New',monospace"

# Zero-width padding after the preview text so that the first words of the
# body do not get pulled into the inbox preview line.
_PREHEADER_PAD = "&#847;&zwnj;&nbsp;" * 40


def _layout(title: str, preheader: str, content_html: str) -> str:
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
                If you didn&rsquo;t request this email, you can safely ignore it.
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
      <span style="font-family:{MONO_FONT};font-size:34px;font-weight:700;
                   letter-spacing:12px;color:{LIME};">{html_lib.escape(code)}</span>
    </td>
  </tr>
</table>"""


# purpose -> (heading, what the code is for, what the code is called)
_OTP_COPY = {
    "registration": ("Verify your account", "verify your account", "verification code"),
    "password_reset": ("Reset your password", "reset your password", "password reset code"),
    "password_change": (
        "Confirm your password change",
        "confirm your password change",
        "confirmation code",
    ),
    "phone_change": (
        "Confirm your new phone number",
        "confirm your new number",
        "confirmation code",
    ),
    "email_change": (
        "Confirm your new email address",
        "confirm your new email address",
        "confirmation code",
    ),
}


def admin_login_email(code: str, ttl_minutes: int, requested_by: str) -> tuple[str, str, str]:
    """The admin sign-in code. The subject carries no code."""
    subject = f"Your {BRAND} admin sign-in code"
    who = (
        f"Someone signed in to the {BRAND} admin panel as {requested_by} with the right "
        f"password. This code finishes that sign-in and works for {ttl_minutes} minutes."
    )
    text = (
        f"{subject}\n\n"
        f"Your code is {code}.\n\n{who}\n\n"
        "If this wasn't you, don't share the code and change your password now."
    )
    html = _layout(
        subject,
        "Finish signing in to the admin panel.",
        f"""\
{_heading("Your admin sign-in code")}
<p class="ah-text" style="margin:0;">{html_lib.escape(who)}</p>
{_code_box(code)}
<p class="ah-muted" style="margin:0;color:{MUTED};">It can only be used once. If this wasn&rsquo;t
you, don&rsquo;t share the code and change your password now.</p>""",
    )
    return subject, text, html


def otp_email(
    code: str, purpose: str, ttl_minutes: int, requested_by: str | None = None
) -> tuple[str, str, str]:
    if purpose == "admin_login":
        return admin_login_email(code, ttl_minutes, requested_by or "your account")
    heading, action, noun = _OTP_COPY.get(
        purpose, ("Your one-time code", f"complete your {purpose}", "code")
    )
    subject = f"{code} is your {BRAND} {noun}"
    text = (
        f"{heading}\n\n"
        f"Your {BRAND} {noun} is {code}. Use it to {action}.\n\n"
        f"It expires in {ttl_minutes} minutes. "
        "If you didn't request this, you can safely ignore this email."
    )
    html = _layout(
        subject,
        f"Your code is {code}. It expires in {ttl_minutes} minutes.",
        f"""\
{_heading(heading)}
<p class="ah-text" style="margin:0;">Use this code to {action}:</p>
{_code_box(code)}
<p class="ah-muted" style="margin:0;color:{MUTED};">This code expires in
<strong>{ttl_minutes} minutes</strong> and can only be used once. Never share it with
anyone.</p>""",
    )
    return subject, text, html


def reset_email(token: str, ttl_minutes: int) -> tuple[str, str, str]:
    subject = f"Reset your {BRAND} password"
    text = (
        f"We received a request to reset your {BRAND} password.\n\n"
        f"Your reset code is: {token}\n\n"
        f"Enter it in the app within {ttl_minutes} minutes. "
        "If you didn't request this, your account is safe — just ignore this email."
    )
    safe = html_lib.escape(token)
    html = _layout(
        subject,
        f"Your reset code expires in {ttl_minutes} minutes.",
        f"""\
{_heading("Reset your password")}
<p class="ah-text" style="margin:0;">We received a request to reset your {BRAND} password.
Enter this code in the app:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="margin:22px 0;">
  <tr>
    <td bgcolor="{INK}" style="background-color:{INK};border-radius:12px;padding:16px 14px;">
      <span style="font-family:{MONO_FONT};font-size:14px;color:{LIME};
                   word-break:break-all;">{safe}</span>
    </td>
  </tr>
</table>
<p class="ah-muted" style="margin:0;color:{MUTED};">The code expires in
<strong>{ttl_minutes} minutes</strong>. If you didn&rsquo;t request this, your account is safe
&mdash; no action is needed.</p>""",
    )
    return subject, text, html


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
