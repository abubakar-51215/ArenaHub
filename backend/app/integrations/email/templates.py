"""Branded HTML email templates (plain-text fallback is composed alongside).

Email clients ignore <style> blocks and external CSS, so everything is
inline-styled on a single centred card. Each helper returns
``(subject, text_body, html_body)`` ready for ``send_email``.
"""

import html as html_lib

BRAND = "ArenaHub"
ACCENT = "#059669"  # emerald-600 — matches the web dashboard's primary button
TEXT = "#111827"
MUTED = "#6B7280"
BORDER = "#E5E7EB"


def _layout(preheader: str, content_html: str) -> str:
    return f"""\
<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#F3F4F6;">
    <span style="display:none;max-height:0;overflow:hidden;">{preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background-color:#F3F4F6;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="max-width:480px;background-color:#ffffff;border-radius:12px;
                        border:1px solid {BORDER};overflow:hidden;
                        font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
            <tr>
              <td style="background-color:{ACCENT};padding:20px 32px;">
                <span style="font-size:20px;font-weight:700;color:#ffffff;
                             letter-spacing:0.5px;">&#127934; {BRAND}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;color:{TEXT};font-size:14px;line-height:1.6;">
                {content_html}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;border-top:1px solid {BORDER};
                         color:{MUTED};font-size:12px;line-height:1.5;">
                {BRAND} — sports arena booking platform for Pakistan.<br>
                If you didn't request this email, you can safely ignore it.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""


def _code_box(code: str) -> str:
    return f"""\
<div style="background-color:#F0FDF4;border:1px dashed {ACCENT};border-radius:10px;
            padding:18px;text-align:center;margin:20px 0;">
  <span style="font-size:32px;font-weight:700;letter-spacing:10px;color:{ACCENT};">{code}</span>
</div>"""


def otp_email(code: str, purpose: str, ttl_minutes: int) -> tuple[str, str, str]:
    subject = f"{code} is your {BRAND} verification code"
    text = (
        f"Your {BRAND} {purpose} code is {code}.\n\n"
        f"It expires in {ttl_minutes} minutes. "
        "If you didn't request this, you can safely ignore this email."
    )
    html = _layout(
        f"Your verification code is {code}",
        f"""\
<p style="margin:0 0 8px;font-size:18px;font-weight:700;">Verify your account</p>
<p style="margin:0;">Use this code to complete your {purpose}:</p>
{_code_box(code)}
<p style="margin:0;color:{MUTED};">This code expires in <strong>{ttl_minutes} minutes</strong>
and can only be used once.</p>""",
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
    html = _layout(
        "Your password reset code",
        f"""\
<p style="margin:0 0 8px;font-size:18px;font-weight:700;">Reset your password</p>
<p style="margin:0;">We received a request to reset your {BRAND} password.
Enter this code in the app:</p>
<div style="background-color:#F9FAFB;border:1px solid {BORDER};border-radius:10px;
            padding:14px 18px;margin:20px 0;text-align:center;">
  <span style="font-size:14px;font-family:Consolas,Menlo,monospace;color:{TEXT};
               word-break:break-all;">{token}</span>
</div>
<p style="margin:0;color:{MUTED};">The code expires in <strong>{ttl_minutes} minutes</strong>.
If you didn't request this, your account is safe — no action is needed.</p>""",
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
        safe_title,
        f"""\
<p style="margin:0 0 8px;font-size:18px;font-weight:700;">{safe_title}</p>
<p style="margin:0;">{safe_body}</p>""",
    )
    return subject, text, html
