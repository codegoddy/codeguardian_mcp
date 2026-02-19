"""
Currency formatting utilities for the TSFA system.
Supports major currencies with proper formatting based on locale conventions.
"""

from decimal import Decimal
from typing import Dict, Optional

# Currency configuration with symbol, decimal places, and formatting rules
CURRENCY_CONFIG: Dict[str, Dict[str, any]] = {
    "USD": {
        "symbol": "$",
        "name": "US Dollar",
        "decimal_places": 2,
        "symbol_position": "before",  # before or after
        "decimal_separator": ".",
        "thousands_separator": ",",
    },
    "EUR": {
        "symbol": "€",
        "name": "Euro",
        "decimal_places": 2,
        "symbol_position": "before",
        "decimal_separator": ".",
        "thousands_separator": ",",
    },
    "GBP": {
        "symbol": "£",
        "name": "British Pound",
        "decimal_places": 2,
        "symbol_position": "before",
        "decimal_separator": ".",
        "thousands_separator": ",",
    },
    "KES": {
        "symbol": "KSh",
        "name": "Kenyan Shilling",
        "decimal_places": 2,
        "symbol_position": "before",
        "decimal_separator": ".",
        "thousands_separator": ",",
    },
    "NGN": {
        "symbol": "₦",
        "name": "Nigerian Naira",
        "decimal_places": 2,
        "symbol_position": "before",
        "decimal_separator": ".",
        "thousands_separator": ",",
    },
    "ZAR": {
        "symbol": "R",
        "name": "South African Rand",
        "decimal_places": 2,
        "symbol_position": "before",
        "decimal_separator": ".",
        "thousands_separator": ",",
    },
    "CAD": {
        "symbol": "C$",
        "name": "Canadian Dollar",
        "decimal_places": 2,
        "symbol_position": "before",
        "decimal_separator": ".",
        "thousands_separator": ",",
    },
    "AUD": {
        "symbol": "A$",
        "name": "Australian Dollar",
        "decimal_places": 2,
        "symbol_position": "before",
        "decimal_separator": ".",
        "thousands_separator": ",",
    },
    "INR": {
        "symbol": "₹",
        "name": "Indian Rupee",
        "decimal_places": 2,
        "symbol_position": "before",
        "decimal_separator": ".",
        "thousands_separator": ",",
    },
    "JPY": {
        "symbol": "¥",
        "name": "Japanese Yen",
        "decimal_places": 0,  # Yen doesn't use decimal places
        "symbol_position": "before",
        "decimal_separator": "",
        "thousands_separator": ",",
    },
    "CNY": {
        "symbol": "¥",
        "name": "Chinese Yuan",
        "decimal_places": 2,
        "symbol_position": "before",
        "decimal_separator": ".",
        "thousands_separator": ",",
    },
}


def get_supported_currencies() -> Dict[str, str]:
    """
    Get list of supported currencies with their names.

    Returns:
        Dict mapping currency codes to currency names
    """
    return {code: config["name"] for code, config in CURRENCY_CONFIG.items()}


def format_currency(
    amount: Decimal | float | int,
    currency_code: str = "USD",
    include_symbol: bool = True,
    include_code: bool = False,
) -> str:
    """
    Format a monetary amount according to currency conventions.

    Args:
        amount: The monetary amount to format
        currency_code: ISO 4217 currency code (e.g., 'USD', 'EUR', 'KES')
        include_symbol: Whether to include the currency symbol
        include_code: Whether to include the currency code (e.g., 'USD')

    Returns:
        Formatted currency string

    Examples:
        >>> format_currency(1234.56, "USD")
        '$1,234.56'
        >>> format_currency(1234.56, "EUR")
        '€1,234.56'
        >>> format_currency(1234.56, "KES")
        'KSh1,234.56'
        >>> format_currency(1234.56, "USD", include_code=True)
        '$1,234.56 USD'
    """
    # Convert to Decimal for precise calculations
    if not isinstance(amount, Decimal):
        amount = Decimal(str(amount))

    # Get currency configuration
    currency_code = currency_code.upper()
    if currency_code not in CURRENCY_CONFIG:
        # Fallback to USD if currency not supported
        currency_code = "USD"

    config = CURRENCY_CONFIG[currency_code]

    # Round to appropriate decimal places
    decimal_places = config["decimal_places"]
    amount = amount.quantize(Decimal(10) ** -decimal_places)

    # Split into integer and decimal parts
    amount_str = str(abs(amount))
    if "." in amount_str:
        integer_part, decimal_part = amount_str.split(".")
    else:
        integer_part = amount_str
        decimal_part = ""

    # Add thousands separator
    if config["thousands_separator"]:
        # Add separator from right to left
        integer_with_sep = ""
        for i, digit in enumerate(reversed(integer_part)):
            if i > 0 and i % 3 == 0:
                integer_with_sep = config["thousands_separator"] + integer_with_sep
            integer_with_sep = digit + integer_with_sep
        integer_part = integer_with_sep

    # Combine integer and decimal parts
    if decimal_places > 0 and config["decimal_separator"]:
        # Pad decimal part to required length
        decimal_part = decimal_part.ljust(decimal_places, "0")
        formatted_amount = f"{integer_part}{config['decimal_separator']}{decimal_part}"
    else:
        formatted_amount = integer_part

    # Add negative sign if needed
    if amount < 0:
        formatted_amount = f"-{formatted_amount}"

    # Add currency symbol
    if include_symbol:
        symbol = config["symbol"]
        if config["symbol_position"] == "before":
            formatted_amount = f"{symbol}{formatted_amount}"
        else:
            formatted_amount = f"{formatted_amount} {symbol}"

    # Add currency code
    if include_code:
        formatted_amount = f"{formatted_amount} {currency_code}"

    return formatted_amount


def parse_currency(formatted_amount: str, currency_code: str = "USD") -> Decimal:
    """
    Parse a formatted currency string back to a Decimal amount.

    Args:
        formatted_amount: The formatted currency string
        currency_code: ISO 4217 currency code

    Returns:
        Decimal amount

    Examples:
        >>> parse_currency("$1,234.56", "USD")
        Decimal('1234.56')
        >>> parse_currency("€1.234,56", "EUR")
        Decimal('1234.56')
    """
    currency_code = currency_code.upper()
    if currency_code not in CURRENCY_CONFIG:
        currency_code = "USD"

    config = CURRENCY_CONFIG[currency_code]

    # Remove currency symbol and code
    cleaned = formatted_amount.strip()
    cleaned = cleaned.replace(config["symbol"], "")
    cleaned = cleaned.replace(currency_code, "")
    cleaned = cleaned.strip()

    # Remove thousands separator
    if config["thousands_separator"]:
        cleaned = cleaned.replace(config["thousands_separator"], "")

    # Replace decimal separator with standard dot
    if config["decimal_separator"] and config["decimal_separator"] != ".":
        cleaned = cleaned.replace(config["decimal_separator"], ".")

    # Convert to Decimal
    try:
        return Decimal(cleaned)
    except Exception as e:
        raise ValueError(f"Invalid currency format: {formatted_amount}") from e


def convert_currency_display(amount: Decimal | float | int, from_currency: str, to_currency: str) -> str:
    """
    Convert and format currency for display.
    Note: This is a display-only function. Actual currency conversion
    would require exchange rate APIs in production.

    Args:
        amount: The amount to convert
        from_currency: Source currency code
        to_currency: Target currency code

    Returns:
        Formatted string showing both currencies

    Example:
        >>> convert_currency_display(100, "USD", "EUR")
        '$100.00 USD (€100.00 EUR)'
    """
    from_formatted = format_currency(amount, from_currency, include_code=True)
    to_formatted = format_currency(amount, to_currency, include_code=True)

    return f"{from_formatted} ({to_formatted})"


def get_currency_symbol(currency_code: str) -> str:
    """
    Get the symbol for a currency code.

    Args:
        currency_code: ISO 4217 currency code

    Returns:
        Currency symbol

    Example:
        >>> get_currency_symbol("USD")
        '$'
    """
    currency_code = currency_code.upper()
    if currency_code not in CURRENCY_CONFIG:
        return "$"  # Default to USD symbol

    return CURRENCY_CONFIG[currency_code]["symbol"]


def validate_currency_code(currency_code: str) -> bool:
    """
    Check if a currency code is supported.

    Args:
        currency_code: ISO 4217 currency code

    Returns:
        True if supported, False otherwise
    """
    return currency_code.upper() in CURRENCY_CONFIG
