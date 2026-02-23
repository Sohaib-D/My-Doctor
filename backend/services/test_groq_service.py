import re

import pytest

from backend.services import groq_service as gs


def test_detect_expected_language_english():
    assert gs._detect_expected_language("hello world") == gs._LANG_ENGLISH
    assert gs._detect_expected_language("Please help me") == gs._LANG_ENGLISH


def test_detect_expected_language_urdu_script():
    assert gs._detect_expected_language("سلام کیسے ہیں؟") == gs._LANG_URDU_SCRIPT
    # mixed with latin characters should still classify as urdu script because script appears
    assert gs._detect_expected_language("ہم ٹھیک ہیں abc") == gs._LANG_URDU_SCRIPT


def test_detect_expected_language_roman_urdu():
    assert gs._detect_expected_language("aap kaise hain") == gs._LANG_ROMAN_URDU
    assert gs._detect_expected_language("main thik hoon") == gs._LANG_ROMAN_URDU
    # english like text should not be tagged as roman urdu
    assert gs._detect_expected_language("this is a test") == gs._LANG_ENGLISH


def test_detect_expected_language_explicit_urdu_script_override():
    assert gs._detect_expected_language("ye urdu script may likho") == gs._LANG_URDU_SCRIPT
    assert gs._detect_expected_language("Please reply in Urdu") == gs._LANG_URDU_SCRIPT
    assert gs._detect_expected_language("\u06cc\u06c1 \u0627\u0631\u062f\u0648 \u0645\u06cc\u06ba \u0644\u06a9\u06be\u06cc\u06ba") == gs._LANG_URDU_SCRIPT
    # New cases for explicit override in English/Roman Urdu
    assert gs._detect_expected_language("write in urdu script please") == gs._LANG_URDU_SCRIPT
    assert gs._detect_expected_language("urdu mein btao") == gs._LANG_URDU_SCRIPT


def test_detect_expected_language_urdu_word_without_request():
    assert gs._detect_expected_language("Tell me about Urdu literature") == gs._LANG_ENGLISH


def test_is_language_compliant_english():
    assert gs._is_language_compliant("this is english.", gs._LANG_ENGLISH)
    assert not gs._is_language_compliant("سلام", gs._LANG_ENGLISH)
    assert not gs._is_language_compliant("main thik hoon", gs._LANG_ENGLISH)


def test_is_language_compliant_urdu_script_strict():
    # Pure Urdu script with proper punctuation should pass
    assert gs._is_language_compliant("کیا آپ بہتر محسوس کر رہے ہیں؟", gs._LANG_URDU_SCRIPT)
    assert gs._is_language_compliant("میرا سر درد ٹھیک ہو گیا ہے۔", gs._LANG_URDU_SCRIPT)
    
    # ASCII punctuation (., ?) should fail
    assert not gs._is_language_compliant("کیا آپ ٹھیک ہیں?", gs._LANG_URDU_SCRIPT)
    assert not gs._is_language_compliant("میرا سر درد ہے.", gs._LANG_URDU_SCRIPT)
    
    # English words should fail
    assert not gs._is_language_compliant("آپ کو fever ہے؟", gs._LANG_URDU_SCRIPT)
    
    # Devanagari should fail
    assert not gs._is_language_compliant("क्या आप ठीक हैं؟", gs._LANG_URDU_SCRIPT)


def test_is_language_compliant_roman_urdu():
    assert gs._is_language_compliant("aap kaise hain", gs._LANG_ROMAN_URDU)
    assert not gs._is_language_compliant("سلام", gs._LANG_ROMAN_URDU)
    assert not gs._is_language_compliant("this is english", gs._LANG_ROMAN_URDU)


def test_language_instruction_strict_alignment():
    instr = gs._build_turn_language_instruction(gs._LANG_URDU_SCRIPT)
    assert "pure Urdu vocabulary" in instr
    assert "proper Urdu punctuation" in instr
    
    rewrite_instr = gs._build_language_rewrite_instruction(gs._LANG_URDU_SCRIPT)
    assert "pure Urdu vocabulary" in rewrite_instr
    assert "proper Urdu punctuation" in rewrite_instr


def test_language_fallback_urdu():
    fallback = gs._build_language_fallback(gs._LANG_URDU_SCRIPT)
    # fallback text should contain Urdu script and not English
    assert gs._contains_urdu_script(fallback)
    assert not gs._contains_latin(fallback)
