"""What a 6-digit code is for. Every lookup filters by purpose, so a code issued for one flow can
never complete another (a sign-up code cannot reset a password). Issuing, sending and checking
codes: ``app/shared/codes.py``."""

from enum import StrEnum


class OtpPurpose(StrEnum):
    registration = "registration"
    password_reset = "password_reset"
    password_change = "password_change"
    phone_change = "phone_change"
    email_change = "email_change"
    admin_login = "admin_login"  # second sign-in step for admins
    account_deletion = "account_deletion"
    bank_details_change = "bank_details_change"
