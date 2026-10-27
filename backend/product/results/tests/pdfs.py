"""Build small text-layer PDFs for tests. Every patient in them is fictitious."""


def _escape(text: str) -> str:
    return text.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def make_pdf(lines: list[str]) -> bytes:
    """One A4 page with one line of Courier text per entry (monospace keeps column spacing)."""
    stream_lines = ['BT', '/F1 10 Tf', '12 TL', '40 800 Td']
    for line in lines:
        stream_lines.append(f'({_escape(line)}) Tj T*')
    stream_lines.append('ET')
    stream = '\n'.join(stream_lines).encode('latin-1')
    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R '
        b'/Resources << /Font << /F1 5 0 R >> >> >>',
        b'<< /Length ' + str(len(stream)).encode() + b' >>\nstream\n' + stream + b'\nendstream',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
    ]
    out = bytearray(b'%PDF-1.4\n')
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f'{number} 0 obj\n'.encode() + body + b'\nendobj\n'
    xref = len(out)
    out += f'xref\n0 {len(objects) + 1}\n0000000000 65535 f \n'.encode()
    for offset in offsets:
        out += f'{offset:010d} 00000 n \n'.encode()
    out += f'trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
    return bytes(out)


def header(name='Laila Ahmed', dob='09/03/1974', file_number='VC-000001', collected='03/10/2026'):
    lines = ['Nile Diagnostics Laboratory', '']
    lines.append(f'Patient Name: {name}      Age: 52 Y      Sex: F' if name else 'Age: 52 Y      Sex: F')
    if dob:
        lines.append(f'DOB: {dob}')
    if file_number:
        lines.append(f'File No: {file_number}')
    if collected:
        lines.append(f'Collected: {collected}      Reported: 04/10/2026')
    lines += ['', 'Test                      Result    Unit       Reference range']
    return lines


BLOODS = [
    'Ferritin                  32.0  L   ng/mL      13 - 150',
    'TSH                       1.8       mIU/L      0.4 - 4.0',
    'HbA1c                     5.3       %          4.0 - 5.6',
    'Estradiol                 18        pg/mL      <30 postmenopausal',
    'FSH                       64.2  H   mIU/mL     1.5 - 12.4',
    'Page 1 of 1',
]

STI = [
    'High vaginal swab - STI screen (PCR)',
    'Chlamydia trachomatis:          Detected',
    'Neisseria gonorrhoeae:          Not detected',
    'Trichomonas vaginalis           Negative',
]

SMEAR_NORMAL = [
    'Liquid based cytology - cervical smear',
    'Specimen adequacy: Satisfactory for evaluation',
    'Interpretation: Negative for intraepithelial lesion or malignancy (NILM)',
]

SMEAR_ABNORMAL = [
    'Liquid based cytology - cervical smear',
    'Interpretation: Low-grade squamous intraepithelial lesion (LSIL)',
]

SMEAR_UNCLEAR = [
    'Cervical cytology',
    'Interpretation: see comment',
]
