"""
The patient's current medicines, as one normalised list for the alert rules and the form prefill.
"""
import unicodedata

_APOSTROPHES = str.maketrans({'’': "'", '‘': "'", 'ʼ': "'", '`': "'"})


def normalise_medicine(text: str) -> str:
    """Casefold, curly apostrophes made straight then dropped, other punctuation a space, spaces collapsed."""
    text = (text or '').translate(_APOSTROPHES).casefold().replace("'", '')
    text = ''.join(' ' if unicodedata.category(ch).startswith('P') else ch for ch in text)
    return ' '.join(text.split())


def matches_terms(names, terms) -> list[str]:
    """The names (as given) that contain any of the terms, both sides normalised."""
    wanted = [t for t in (normalise_medicine(term) for term in terms) if t]
    return [name for name in names if any(term in normalise_medicine(name) for term in wanted)]


def _row_name(row, *keys) -> str:
    """A repeat row's name: the row itself when it is plain text, else the first of these keys that is set."""
    if isinstance(row, str):
        return row
    if isinstance(row, dict):
        return next((str(row[key]) for key in keys if row.get(key)), '')
    return ''


def _rows(value) -> list:
    return value if isinstance(value, list) else []


def _when(form):
    return form.submitted_at if form is not None else None


def intake_medicines(history) -> list[tuple[str, object]]:
    """
    (name, when the form saying so was sent) for the medicines the patient's forms say she takes now:
    `current_medicines` rows, `hormones` rows with no stop date, and follow-up `medicines` rows still taken.
    """
    pairs = [(_row_name(row, 'name'), _when(history.form_for('current_medicines')))
             for row in _rows(history.merged('current_medicines'))]
    pairs += [(_row_name(row, 'product', 'name'), _when(history.form_for('hormones')))
              for row in _rows(history.merged('hormones')) if not (isinstance(row, dict) and row.get('stop'))]
    pairs += [(_row_name(row, 'name'), _when(history.latest_form('medicines')))
              for row in _rows(history.latest('medicines'))
              if not (isinstance(row, dict) and row.get('still_taking') is False)]
    return pairs


def stopped_medicines(history) -> tuple[set[str], object]:
    """(normalised names, when): the medicines the newest follow-up form marked as no longer taken."""
    rows = _rows(history.latest('medicines'))
    names = {normalise_medicine(_row_name(row, 'name')) for row in rows
             if isinstance(row, dict) and row.get('still_taking') is False}
    return names - {''}, _when(history.latest_form('medicines'))


def _last_prescriptions_sent_at(patient):
    from product.review.models import SentEmail

    return (SentEmail.objects.filter(case__patient=patient, status=SentEmail.Status.SENT,
                                     draft__prescriptions__isnull=False)
            .order_by('-sent_at').values_list('sent_at', flat=True).first())


def current_medicine_names(patient, history=None, *, as_written=False) -> list[str]:
    """
    The patient's current medicine names, normalised and without repeats: the latest order's
    medicines (orders.services.current_medicines), the prescriptions in the last sent results email
    (review.services.last_prescriptions), and the intake `current_medicines` and `hormones` rows
    still taken. A medicine the newest follow-up form marks as no longer taken is left out, unless
    an order, email or form after that follow-up lists it again. Pass `history`
    (intake.history.patient_history) when the caller already built it. With `as_written`, each name
    is returned as first written (for the patient to read); repeats are still found by the
    normalised name.
    """
    from product.orders.services import current_medicines
    from product.review.services import last_prescriptions

    if history is None:
        from product.intake.history import patient_history

        history = patient_history(patient)
    pairs = [(m.drug, m.order.created_at) for m in current_medicines(patient)]
    prescriptions = last_prescriptions(patient)
    if prescriptions:
        sent_at = _last_prescriptions_sent_at(patient)
        pairs += [(p.drug, sent_at) for p in prescriptions]
    pairs += intake_medicines(history)
    stopped, stopped_at = stopped_medicines(history)
    unique = {}
    for name, when in pairs:
        key = normalise_medicine(name)
        if not key:
            continue
        if key in stopped and (when is None or stopped_at is None or when <= stopped_at):
            continue
        unique.setdefault(key, ' '.join(str(name).split()))
    return list(unique.values()) if as_written else list(unique)
