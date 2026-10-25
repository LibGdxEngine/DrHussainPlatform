"""The sign-in surface is rate-limited per client address, and resending an OTP does not reset guesses."""
from unittest.mock import patch

from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.api.throttles import LoginThrottle, OTPThrottle, PasswordThrottle
from apps.accounts.models import User, VerificationChallenge, VerificationChannel, VerificationPurpose
from apps.accounts.services.verification import (
    compute_code_digest,
    create_verification_challenge,
    resend_verification_challenge,
    verify_challenge_code,
)


class ThrottlingTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

    def post_until_throttled(self, url, payload, limit):
        for _ in range(limit):
            response = self.client.post(url, payload, format='json')
            self.assertNotEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        return self.client.post(url, payload, format='json')

    def test_login_guessing_is_cut_off_with_the_shared_error_envelope(self):
        with patch.object(LoginThrottle, 'THROTTLE_RATES', {'auth_login': '3/min'}):
            response = self.post_until_throttled(
                reverse('auth:login'), {'identifier': 'nobody@example.com', 'password': 'wrong'}, limit=3,
            )
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(response.data['error']['code'], 'throttled')
        self.assertIn('Retry-After', response.headers)

    def test_legacy_token_endpoint_shares_the_login_limit(self):
        with patch.object(LoginThrottle, 'THROTTLE_RATES', {'auth_login': '2/min'}):
            self.client.post(reverse('auth:login'), {'identifier': 'nobody@example.com', 'password': 'x'}, format='json')
            self.client.post('/api/token/', {'identifier': 'nobody@example.com', 'password': 'x'}, format='json')
            response = self.client.post('/api/token/', {'identifier': 'nobody@example.com', 'password': 'x'},
                                        format='json')
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_otp_confirmation_is_rate_limited(self):
        with patch.object(OTPThrottle, 'THROTTLE_RATES', {'auth_otp': '2/min'}):
            response = self.post_until_throttled(
                reverse('auth:verification_confirm'),
                {'challenge_id': '00000000-0000-0000-0000-000000000000', 'code': '000000'}, limit=2,
            )
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_password_reset_requests_are_rate_limited(self):
        with patch.object(PasswordThrottle, 'THROTTLE_RATES', {'auth_password': '1/min'}):
            response = self.post_until_throttled(
                reverse('auth:password_forgot'), {'identifier': 'nobody@example.com'}, limit=1,
            )
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_unlisted_endpoints_require_a_signed_in_user_by_default(self):
        # The default permission is deny; the public views above opt in explicitly.
        self.assertEqual(self.client.get('/api/billing/subscriptions/').status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self.client.get('/api/organizations/').status_code, status.HTTP_401_UNAUTHORIZED)


class OTPAttemptBudgetTests(APITestCase):
    def test_resending_a_code_keeps_the_attempt_count(self):
        user = User.objects.create_user(email='otp@example.com', phone='+201000000001', password='Pass12345!')
        challenge, _ = create_verification_challenge(
            user, VerificationPurpose.SIGNUP, '+201000000001', channel=VerificationChannel.WHATSAPP,
        )
        for _ in range(3):
            with self.assertRaises(ValidationError):
                verify_challenge_code(str(challenge.id), '000000')
        challenge.last_sent_at = None
        challenge.save(update_fields=['last_sent_at'])
        resent, code = resend_verification_challenge(str(challenge.id))
        self.assertEqual(resent.attempt_count, 3)
        self.assertEqual(resent.code_digest, compute_code_digest(code))
        # Two guesses remain of the five, then the challenge is spent even with the right code.
        for _ in range(2):
            with self.assertRaises(ValidationError):
                verify_challenge_code(str(resent.id), '000000')
        with self.assertRaisesMessage(ValidationError, 'Maximum verification attempts exceeded'):
            verify_challenge_code(str(resent.id), code)
        self.assertIsNone(VerificationChallenge.objects.get(pk=challenge.pk).consumed_at)
