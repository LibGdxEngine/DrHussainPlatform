"""
Per-address rate limits for the sign-in surface. These views are reachable without a token, so
without them a password, OTP code or reset code can be guessed at network speed. Rates come from
REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'] (THROTTLE_* environment variables).
"""
from rest_framework.throttling import AnonRateThrottle


class LoginThrottle(AnonRateThrottle):
    scope = 'auth_login'


class OTPThrottle(AnonRateThrottle):
    scope = 'auth_otp'


class PasswordThrottle(AnonRateThrottle):
    scope = 'auth_password'


class SignupThrottle(AnonRateThrottle):
    scope = 'auth_signup'
