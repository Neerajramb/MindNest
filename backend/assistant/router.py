"""Intent routing: decide which source answers a question (AI spec sections 10 and 13).

Rules first, because they are fast, testable and never hallucinate. Saved conversations are also consulted for
schedule, appointment, general and untracked-item questions (see `answers.answer`), because people rarely phrase
"what did someone tell me" questions with memory words.
"""

import re
from enum import StrEnum

from care.models import Patient
from objects_ai.service import find_object
from people.models import Person
from scheduling.models import Medication


class Intent(StrEnum):
    MEDICAL_ADVICE = "MEDICAL_ADVICE"
    HELP = "HELP"
    PERSON = "PERSON"
    OBJECT = "OBJECT"
    MEDICATION = "MEDICATION"
    APPOINTMENT = "APPOINTMENT"
    REMINDER = "REMINDER"
    SCHEDULE = "SCHEDULE"
    MEMORY = "MEMORY"
    GENERAL = "GENERAL"


def _has(text: str, *patterns: str) -> bool:
    return any(re.search(rf"\b{p}\b", text) for p in patterns)


ADVICE = (
    r"should i take",
    r"can i take",
    r"extra (dose|pill|tablet)",
    r"double (dose|up)",
    r"skip (my|the)",
    r"side effects?",
    r"is it safe",
    r"stop taking",
    r"how much should",
)
HELP = (r"help me", r"i'?m lost", r"i am lost", r"emergency", r"where am i", r"i feel unsafe", r"scared")
PERSON = (r"who is (this|that|he|she)", r"who'?s (this|that)", r"recogni[sz]e")
FIND = (r"where", r"find", r"lost", r"misplaced", r"put", r"kept", r"left", r"seen", r"can'?t find")
MEDICATION = (r"medicines?", r"medications?", r"pills?", r"tablets?", r"doses?", r"meds")
APPOINTMENT = (r"appointments?", r"doctor", r"clinic", r"hospital", r"dentist", r"check-?up")
REMINDER = (r"remind", r"reminders?")
SCHEDULE = (
    r"today",
    r"tonight",
    r"tomorrow",
    r"schedule",
    r"plans?",
    r"what do i have",
    r"what'?s next",
    r"next",
    r"routine",
    r"this (morning|afternoon|evening)",
    r"what should i do",
    r"(mon|tues|wednes|thurs|fri|satur|sun)day",
    r"this week",
    r"weekend",
)
MEMORY = (
    r"talk(ed)?",
    r"said",
    r"say",
    r"told",
    r"tell me about",
    r"conversations?",
    r"discuss(ed)?",
    r"remember",
    r"last time",
    r"mention(ed)?",
    r"promised",
    r"visit(ing)?",
    r"coming",
    r"spoke",
)


def mentioned_person(patient: Patient, text: str) -> Person | None:
    """A registered person named in the question. Removed people still count: their saved memories remain."""
    lowered = f" {text.lower()} "
    for person in Person.objects.filter(patient=patient).order_by("-is_active", "name"):
        names = [person.name.lower(), person.name.lower().split()[0]]
        if person.relationship:
            names.append(person.relationship.lower())
        if any(f" {n} " in lowered or f" {n}'s " in lowered or f" my {n}" in lowered for n in names if n):
            return person
    return None


def classify(patient: Patient, question: str) -> Intent:
    text = question.lower().strip()
    if _has(text, *ADVICE):
        return Intent.MEDICAL_ADVICE
    if _has(text, *HELP):
        return Intent.HELP
    if _has(text, *PERSON):
        return Intent.PERSON
    if _has(text, *FIND) and find_object(patient, text) is not None:
        return Intent.OBJECT
    med_names = [m.name.lower() for m in Medication.objects.filter(patient=patient, is_active=True)]
    if _has(text, *MEDICATION) or any(name in text for name in med_names):
        return Intent.MEDICATION
    if _has(text, *APPOINTMENT):
        return Intent.APPOINTMENT
    if _has(text, *REMINDER):
        return Intent.REMINDER
    if _has(text, *MEMORY) or mentioned_person(patient, text) is not None:
        return Intent.MEMORY
    if _has(text, *SCHEDULE):
        return Intent.SCHEDULE
    if _has(text, *FIND):
        return Intent.OBJECT  # "where are my scissors": answered as an untracked item
    return Intent.GENERAL
