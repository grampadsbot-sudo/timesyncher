from __future__ import annotations

import re

_QUOTE_NORMALIZE = str.maketrans(
    {
        "\u2018": "'",
        "\u2019": "'",
        "\u201a": "'",
        "\u201b": "'",
        "`": "'",
        "\u00b4": "'",
        "\u2032": "'",
    }
)


def norm_match_key(value) -> str:
    text = str(value or "").translate(_QUOTE_NORMALIZE)
    return re.sub(r"\s+", " ", text).strip().lower()


def names_match(left, right) -> bool:
    return norm_match_key(left) == norm_match_key(right)
