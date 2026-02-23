import asyncio

from backend.services import groq_service as gs


def test_detect_expected_language_english():
    assert gs._detect_expected_language("hello world") == gs._LANG_ENGLISH
    assert gs._detect_expected_language("Please help me") == gs._LANG_ENGLISH


def test_detect_expected_language_urdu_script():
    assert (
        gs._detect_expected_language(
            "\u0633\u0644\u0627\u0645 \u06a9\u06cc\u0633\u06d2 \u06c1\u06cc\u06ba\u061f"
        )
        == gs._LANG_URDU_SCRIPT
    )
    # Mixed with latin text still classifies as Urdu script when script is present.
    assert (
        gs._detect_expected_language(
            "\u06c1\u0645 \u0679\u06be\u06cc\u06a9 \u06c1\u06cc\u06ba abc"
        )
        == gs._LANG_URDU_SCRIPT
    )


def test_detect_expected_language_roman_urdu():
    assert gs._detect_expected_language("aap kaise hain") == gs._LANG_ROMAN_URDU
    assert gs._detect_expected_language("main thik hoon") == gs._LANG_ROMAN_URDU
    assert gs._detect_expected_language("this is a test") == gs._LANG_ENGLISH


def test_detect_expected_language_explicit_urdu_script_override():
    assert gs._detect_expected_language("ye urdu script may likho") == gs._LANG_URDU_SCRIPT
    assert gs._detect_expected_language("Please reply in Urdu") == gs._LANG_URDU_SCRIPT
    assert (
        gs._detect_expected_language(
            "\u06cc\u06c1 \u0627\u0631\u062f\u0648 \u0645\u06cc\u06ba \u0644\u06a9\u06be\u06cc\u06ba"
        )
        == gs._LANG_URDU_SCRIPT
    )
    assert gs._detect_expected_language("write in urdu script please") == gs._LANG_URDU_SCRIPT
    assert gs._detect_expected_language("urdu mein btao") == gs._LANG_URDU_SCRIPT


def test_detect_expected_language_urdu_word_without_request():
    assert gs._detect_expected_language("Tell me about Urdu literature") == gs._LANG_ENGLISH


def test_is_language_compliant_english():
    assert gs._is_language_compliant("this is english.", gs._LANG_ENGLISH)
    assert not gs._is_language_compliant("\u0633\u0644\u0627\u0645", gs._LANG_ENGLISH)
    assert not gs._is_language_compliant("main thik hoon", gs._LANG_ENGLISH)


def test_is_language_compliant_urdu_script():
    assert gs._is_language_compliant(
        "\u06a9\u06cc\u0627 \u0622\u067e \u0628\u06c1\u062a\u0631 \u0645\u062d\u0633\u0648\u0633 \u06a9\u0631 \u0631\u06c1\u06d2 \u06c1\u06cc\u06ba\u061f",
        gs._LANG_URDU_SCRIPT,
    )
    assert gs._is_language_compliant(
        "\u0645\u06cc\u0631\u0627 \u0633\u0631 \u062f\u0631\u062f \u0679\u06be\u06cc\u06a9 \u06c1\u0648 \u06af\u06cc\u0627 \u06c1\u06d2\u06d4",
        gs._LANG_URDU_SCRIPT,
    )
    # ASCII punctuation may appear in model output and should not force fallback.
    assert gs._is_language_compliant(
        "\u06a9\u06cc\u0627 \u0622\u067e \u0679\u06be\u06cc\u06a9 \u06c1\u06cc\u06ba?",
        gs._LANG_URDU_SCRIPT,
    )
    assert gs._is_language_compliant(
        "\u0645\u06cc\u0631\u0627 \u0633\u0631 \u062f\u0631\u062f \u06c1\u06d2.",
        gs._LANG_URDU_SCRIPT,
    )
    assert not gs._is_language_compliant(
        "\u0622\u067e \u06a9\u0648 fever \u06c1\u06d2\u061f",
        gs._LANG_URDU_SCRIPT,
    )
    assert not gs._is_language_compliant(
        "\u0915\u094d\u092f\u093e \u0906\u092a \u0920\u0940\u0915 \u0939\u0948\u0902\u061f",
        gs._LANG_URDU_SCRIPT,
    )


def test_is_language_compliant_roman_urdu():
    assert gs._is_language_compliant("aap kaise hain", gs._LANG_ROMAN_URDU)
    assert not gs._is_language_compliant("\u0633\u0644\u0627\u0645", gs._LANG_ROMAN_URDU)
    assert not gs._is_language_compliant("this is english", gs._LANG_ROMAN_URDU)


def test_normalize_urdu_script_reply_converts_ascii_punctuation_and_markdown():
    raw = (
        "**\u067e\u06cc\u0679 \u062f\u0631\u062f:**\n"
        "- \u06c1\u0644\u06a9\u06cc \u063a\u0630\u0627 \u0644\u06cc\u06ba.\n"
        "- \u067e\u0627\u0646\u06cc \u067e\u06cc\u0626\u06ba, \u0622\u0631\u0627\u0645 \u06a9\u0631\u06cc\u06ba?"
    )
    normalized = gs._normalize_reply_for_expected_language(raw, gs._LANG_URDU_SCRIPT)
    assert "*" not in normalized
    assert ":" not in normalized
    assert "," not in normalized
    assert "." not in normalized
    assert "?" not in normalized
    assert "\u06d4" in normalized
    assert "\u060c" in normalized
    assert "\u061f" in normalized
    assert "\u2022 " in normalized


def test_chat_with_groq_urdu_switch_does_not_force_generic_fallback(monkeypatch):
    async def fake_generate_with_fallback(_messages):
        return (
            "**\u067e\u06cc\u0679 \u062f\u0631\u062f:** "
            "\u06c1\u0644\u06a9\u06cc \u063a\u0630\u0627 \u0644\u06cc\u06ba, "
            "\u067e\u0627\u0646\u06cc \u067e\u06cc\u0626\u06ba."
        )

    monkeypatch.setattr(gs, "GROQ_API_KEY", "test-key")
    monkeypatch.setattr(gs, "generate_with_fallback", fake_generate_with_fallback)

    response = asyncio.run(
        gs.chat_with_groq("Axha meray pait may dard hay is k liay Urdu script may dawai btao")
    )
    fallback = gs._build_language_fallback(gs._LANG_URDU_SCRIPT)
    assert response.response != fallback
    assert "\u067e\u06cc\u0679" in response.response
    assert "?" not in response.response
    assert "\u06d4" in response.response
