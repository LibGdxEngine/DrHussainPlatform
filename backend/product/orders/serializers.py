from rest_framework import serializers

from product.appointments.models import Appointment
from product.content.models import PrescriptionItem
from product.patients.models import Patient
from product.records.models import Document

from .models import Order, PrescribedMedicine, RequestedTest


def _person(user) -> str:
    if user is None:
        return ''
    return user.get_full_name() or user.email or user.phone or ''


class RequestedTestSerializer(serializers.ModelSerializer):
    order_title = serializers.CharField(source='order.title', read_only=True)
    requested_at = serializers.DateTimeField(source='order.created_at', read_only=True)
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    file_number = serializers.CharField(source='patient.file_number', read_only=True)

    class Meta:
        model = RequestedTest
        fields = ['id', 'patient', 'patient_name', 'file_number', 'order', 'order_title', 'requested_at', 'code', 'name', 'status', 'arrived_at',
                  'document']
        read_only_fields = fields


class RequestedTestUpdateSerializer(serializers.ModelSerializer):
    document = serializers.PrimaryKeyRelatedField(queryset=Document.objects.none(), allow_null=True, required=False)

    class Meta:
        model = RequestedTest
        fields = ['status', 'document']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        organization = self.context.get('organization')
        if organization is not None:
            self.fields['document'].queryset = Document.objects.filter(organization=organization)

    def validate(self, attrs):
        document = attrs.get('document')
        if document is not None and document.patient_id != self.instance.patient_id:
            raise serializers.ValidationError({'document': ['Choose a document from this patient\'s file.']})
        return attrs


class PrescribedMedicineSerializer(serializers.ModelSerializer):
    prescription_item = serializers.PrimaryKeyRelatedField(queryset=PrescriptionItem.objects.none(),
                                                           allow_null=True, required=False)

    class Meta:
        model = PrescribedMedicine
        fields = ['id', 'prescription_item', 'drug', 'dose', 'directions']
        read_only_fields = ['id']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        organization = self.context.get('organization')
        if organization is not None:
            self.fields['prescription_item'].queryset = PrescriptionItem.objects.filter(organization=organization)


class TestLineSerializer(serializers.Serializer):
    code = serializers.SlugField(max_length=64)
    name = serializers.CharField(max_length=128)


class OrderSerializer(serializers.ModelSerializer):
    tests = RequestedTestSerializer(many=True, read_only=True)
    medicines = PrescribedMedicineSerializer(many=True, read_only=True)
    issued_by_name = serializers.SerializerMethodField()
    email_status = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = ['id', 'patient', 'appointment', 'kind', 'title', 'delivery', 'sent_to', 'notes', 'tests',
                  'medicines', 'issued_by_name', 'email_status', 'created_at']
        read_only_fields = fields

    def get_issued_by_name(self, obj) -> str:
        return _person(obj.issued_by)

    def get_email_status(self, obj) -> str:
        """'' when not emailed, else queued, sent or failed."""
        return obj.mail_message.status if obj.mail_message_id else ''


class OrderCreateSerializer(serializers.Serializer):
    patient = serializers.PrimaryKeyRelatedField(queryset=Patient.objects.none())
    appointment = serializers.PrimaryKeyRelatedField(queryset=Appointment.objects.none(), allow_null=True,
                                                     required=False)
    kind = serializers.ChoiceField(choices=Order.Kind.choices)
    title = serializers.CharField(max_length=255)
    delivery = serializers.ChoiceField(choices=Order.Delivery.choices)
    sent_to = serializers.EmailField(required=False, allow_blank=True,
                                     help_text='For email delivery: the lab, or blank for the patient.')
    notes = serializers.CharField(required=False, allow_blank=True, max_length=4000)
    tests = TestLineSerializer(many=True, required=False, max_length=80)
    medicines = PrescribedMedicineSerializer(many=True, required=False, max_length=30)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        organization = self.context.get('organization')
        if organization is not None:
            self.fields['patient'].queryset = Patient.objects.filter(organization=organization)
            self.fields['appointment'].queryset = Appointment.objects.filter(organization=organization)

    def validate(self, attrs):
        if attrs['kind'] == Order.Kind.TESTS and not attrs.get('tests'):
            raise serializers.ValidationError({'tests': ['Choose at least one test.']})
        if attrs['kind'] == Order.Kind.PRESCRIPTION and not attrs.get('medicines'):
            raise serializers.ValidationError({'medicines': ['Add at least one medicine.']})
        appointment = attrs.get('appointment')
        if appointment is not None and appointment.patient_id != attrs['patient'].pk:
            raise serializers.ValidationError({'appointment': ['This visit belongs to another patient.']})
        if attrs['delivery'] == Order.Delivery.EMAIL and not (attrs.get('sent_to') or attrs['patient'].email):
            raise serializers.ValidationError({'sent_to': ['Enter an email address; the patient has none.']})
        return attrs


class PendingCountSerializer(serializers.Serializer):
    pending = serializers.IntegerField(help_text='Requested tests not yet arrived.')
    patients = serializers.IntegerField(help_text='Patients with at least one test still to arrive.')
