import re
import unicodedata
from typing import Optional

BLOCKED_MESSAGE = "[تم حجب معلومات التواصل المباشر لحماية الاتفاقية]"

_ARABIC_NUMBER_WORDS = {
    "صفر": "0",
    "واحد": "1",
    "واحدة": "1",
    "اثنين": "2",
    "اثنان": "2",
    "ثلاثة": "3",
    "ثلاثه": "3",
    "اربعة": "4",
    "أربعة": "4",
    "خمسة": "5",
    "سته": "6",
    "ستة": "6",
    "سبعة": "7",
    "سبعه": "7",
    "ثمانية": "8",
    "ثمانيه": "8",
    "تسعة": "9",
    "تسعه": "9",
}
_PHONE_PATTERN = re.compile(r"(?<!\d)(?:\+?964[\s().-]*)?0?7(?:[\s().-]*\d){9}(?!\d)")
_DOMAIN_PATTERN = re.compile(
    r"(?i)(?:https?://|www\.)\S+|(?<![\w@])(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|ly|me)(?:/\S*)?"
)
_EMAIL_PATTERN = re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")
_COORDINATE_PATTERN = re.compile(
    r"(?<![\d.])[-+]?(?:[0-8]?\d(?:\.\d+)?|90(?:\.0+)?)\s*[,;/]\s*"
    r"[-+]?(?:1[0-7]\d(?:\.\d+)?|[1-9]?\d(?:\.\d+)?|180(?:\.0+)?)(?![\d.])"
)
_ADDRESS_PATTERN = re.compile(
    r"(?i)\b(?:my\s+(?:address|location)|home address|street address|meet(?: me)? at|"
    r"address|location|street|st\.|road|rd\.|building|apartment|flat|house|lane|alley)\b"
    r"\s*(?:is|at|number|no\.|#|:|-)?\s*"
    r"(?:[\w\u0600-\u06ff]+[\s,/-]*){1,8}"
)
_ARABIC_ADDRESS_PATTERN = re.compile(
    r"(?:عنوان(?:ي)?|شارع|زقاق|محلة|دار|منزل|بيت)\s*[:#-]?\s*"
    r"[\w\u0600-\u06ff]+(?:[\s,/-]+[\w\u0600-\u06ff]+){0,7}"
)
_HANDLE_PATTERN = re.compile(r"(?<![\w.])@[A-Za-z0-9_.]{2,}")
_SOCIAL_PATTERN = re.compile(
    r"(?i)\b(?:whats?app|telegram|viber|facebook|instagram|snapchat|"
    r"واتساب|وتساب|تلغرام|تليجرام|فايبر|فيسبوك|انستغرام|إنستغرام|سناب(?:شات)?)\b"
)
_NUMBER_WORD_PATTERN = re.compile(
    r"(?<!\w)(" + "|".join(re.escape(word) for word in sorted(_ARABIC_NUMBER_WORDS, key=len, reverse=True)) + r")(?!\w)"
)


def _ascii_digits(text: str) -> str:
    translated = "".join(
        str(unicodedata.digit(character)) if character.isdigit() else character
        for character in text
    )
    return translated.translate(str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789"))


def detect_contact_violation(message: str) -> Optional[str]:
    """Return a concise moderation category without retaining the supplied text."""
    if _PHONE_PATTERN.search(_ascii_digits(message)):
        return "Attempted phone number sharing in chat"

    spelled_digits = _NUMBER_WORD_PATTERN.sub(
        lambda match: _ARABIC_NUMBER_WORDS[match.group(1)],
        message,
    )
    if _PHONE_PATTERN.search(_ascii_digits(spelled_digits)):
        return "Attempted phone number sharing in chat"

    if _HANDLE_PATTERN.search(message) or _SOCIAL_PATTERN.search(message) or _EMAIL_PATTERN.search(message):
        return "Attempted social media contact sharing in chat"
    if _DOMAIN_PATTERN.search(message):
        return "External link detected"
    if _COORDINATE_PATTERN.search(_ascii_digits(message)):
        return "Attempted exact location sharing in chat"
    if _ADDRESS_PATTERN.search(message) or _ARABIC_ADDRESS_PATTERN.search(message):
        return "Attempted exact location sharing in chat"
    return None
