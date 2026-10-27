from django.core.cache import cache
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.organizations.models import Invitation, Organization, OrganizationMember
from product.testing import make_member, make_user

BASE = '/api/product/staff/'


class StaffApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.owner = make_member(self.clinic, 'doctor@example.com', role=OrganizationMember.Role.OWNER)
        self.reception = make_member(self.clinic, 'reception@example.com')
        self.client.force_authenticate(self.owner)

    def test_me(self):
        response = self.client.get(f'{BASE}me/')
        self.assertEqual((response.data['role'], response.data['is_lead']), ('OWNER', True))
        self.client.force_authenticate(self.reception)
        self.assertFalse(self.client.get(f'{BASE}me/').data['is_lead'])

    def test_members_list_and_role_rules(self):
        members = self.client.get(f'{BASE}members/').data
        self.assertEqual([m['email'] for m in members], ['doctor@example.com', 'reception@example.com'])
        owner_row = next(m for m in members if m['is_me'])
        reception_row = next(m for m in members if not m['is_me'])

        response = self.client.patch(f'{BASE}members/{owner_row["id"]}/', {'role': 'ADMIN'}, format='json')
        self.assertEqual(response.data['error']['code'], 'LAST_OWNER')
        response = self.client.patch(f'{BASE}members/{reception_row["id"]}/', {'role': 'ADMIN'}, format='json')
        self.assertEqual(response.data['role'], 'ADMIN')
        self.assertEqual(self.client.delete(f'{BASE}members/{owner_row["id"]}/').data['error']['code'],
                         'CANNOT_REMOVE_SELF')

        self.client.force_authenticate(make_member(self.clinic, 'staff2@example.com'))
        self.assertEqual(self.client.patch(f'{BASE}members/{reception_row["id"]}/', {'role': 'MEMBER'},
                                           format='json').status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(MAIL_ALLOW_PLATFORM_FALLBACK=False)
    def test_invite_preview_and_accept(self):
        response = self.client.post(f'{BASE}invitations/', {'email': 'Nurse@Example.com', 'role': 'MEMBER'},
                                    format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data['emailed'])
        token = response.data['link'].split('#t=')[1]
        self.assertEqual(self.client.get(f'{BASE}invitations/').data[0]['email'], 'nurse@example.com')

        self.client.force_authenticate(None)
        preview = self.client.post(f'{BASE}join/preview/', {'token': token}, format='json')
        self.assertEqual((preview.data['email'], preview.data['status']), ('nurse@example.com', 'PENDING'))

        self.client.force_authenticate(make_user('someone-else@example.com'))
        self.assertEqual(self.client.post(f'{BASE}join/accept/', {'token': token}, format='json').data['error']['code'],
                         'EMAIL_MISMATCH')

        nurse = make_user('nurse@example.com')
        self.client.force_authenticate(nurse)
        accepted = self.client.post(f'{BASE}join/accept/', {'token': token}, format='json')
        self.assertEqual((accepted.data['clinic_name'], accepted.data['role']), ('V-Clinic', 'MEMBER'))
        self.assertTrue(OrganizationMember.objects.filter(organization=self.clinic, user=nurse).exists())
        again = self.client.post(f'{BASE}join/accept/', {'token': token}, format='json')
        self.assertEqual(again.data['error']['code'], 'INVITATION_NOT_PENDING')

    def test_cannot_invite_existing_member_or_owner(self):
        response = self.client.post(f'{BASE}invitations/', {'email': 'reception@example.com', 'role': 'MEMBER'},
                                    format='json')
        self.assertEqual(response.data['error']['code'], 'ALREADY_MEMBER')
        response = self.client.post(f'{BASE}invitations/', {'email': 'x@example.com', 'role': 'OWNER'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reinvite_replaces_and_revoke(self):
        first = self.client.post(f'{BASE}invitations/', {'email': 'x@example.com', 'role': 'MEMBER'}, format='json')
        second = self.client.post(f'{BASE}invitations/', {'email': 'x@example.com', 'role': 'ADMIN'}, format='json')
        self.assertEqual(Invitation.objects.get(pk=first.data['invitation']['id']).status, 'EXPIRED')
        self.client.post(f'{BASE}invitations/{second.data["invitation"]["id"]}/revoke/')
        self.assertEqual(self.client.get(f'{BASE}invitations/').data, [])
