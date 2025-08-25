"""
Validation utilities for Discord Reminder Bot models.

This module provides validation mixins and utilities for ensuring
data integrity across all database models.
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Union
import re

# Get logger for this module
logger = logging.getLogger(__name__)


class ValidationError(Exception):
    """
    Exception raised when model validation fails.
    """
    
    def __init__(self, errors: Union[str, List[str]]):
        if isinstance(errors, str):
            errors = [errors]
        self.errors = errors
        super().__init__(f"Validation failed: {', '.join(errors)}")


class ValidationMixin:
    """
    Mixin class that provides validation functionality for models.
    """
    
    def validate(self, raise_exception: bool = False) -> List[str]:
        """
        Validate the model instance and return any validation errors.
        
        Args:
            raise_exception: If True, raise ValidationError on validation failure
            
        Returns:
            List[str]: List of validation error messages
            
        Raises:
            ValidationError: If raise_exception is True and validation fails
        """
        errors = []
        
        # Call model-specific validation if it exists
        if hasattr(self, 'validate_data'):
            errors.extend(self.validate_data())
        
        # Validate field constraints
        errors.extend(self._validate_field_constraints())
        
        # Validate foreign key relationships
        errors.extend(self._validate_foreign_keys())
        
        if raise_exception and errors:
            raise ValidationError(errors)
        
        return errors
    
    def _validate_field_constraints(self) -> List[str]:
        """
        Validate field-level constraints.
        
        Returns:
            List[str]: List of field validation errors
        """
        errors = []
        
        for field_name in self._meta.fields:
            field = self._meta.fields[field_name]
            value = getattr(self, field_name, None)
            
            # Check null constraints
            if not field.null and value is None:
                errors.append(f"{field_name} cannot be null")
            
            # Check string length constraints
            if hasattr(field, 'max_length') and field.max_length and value:
                if isinstance(value, str) and len(value) > field.max_length:
                    errors.append(f"{field_name} exceeds maximum length of {field.max_length}")
            
            # Check unique constraints (basic check - database will enforce)
            if hasattr(field, 'unique') and field.unique and value is not None:
                # This is a basic check - the database will enforce uniqueness
                pass
        
        return errors
    
    def _validate_foreign_keys(self) -> List[str]:
        """
        Validate foreign key relationships.
        
        Returns:
            List[str]: List of foreign key validation errors
        """
        errors = []
        
        for field_name in self._meta.fields:
            field = self._meta.fields[field_name]
            if hasattr(field, 'rel_model') and field.rel_model:
                value = getattr(self, field_name, None)
                
                if value is not None:
                    # Check if the referenced object exists
                    try:
                        if hasattr(value, 'id') and value.id:
                            # Object is already loaded
                            continue
                        elif isinstance(value, (int, str)):
                            # Check if the referenced ID exists
                            field.rel_model.get_by_id(value)
                    except:
                        errors.append(f"{field_name} references non-existent {field.rel_model.__name__}")
        
        return errors
    
    def is_valid(self) -> bool:
        """
        Check if the model instance is valid.
        
        Returns:
            bool: True if valid, False otherwise
        """
        return len(self.validate()) == 0
    
    def save_with_validation(self, *args, **kwargs):
        """
        Save the model instance after validation.
        
        Raises:
            ValidationError: If validation fails
        """
        self.validate(raise_exception=True)
        return self.save(*args, **kwargs)


class SerializationMixin:
    """
    Mixin class that provides enhanced serialization functionality.
    """
    
    def to_dict(self, include_relations: bool = False, exclude_fields: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Convert model instance to dictionary with enhanced options.
        
        Args:
            include_relations: If True, include related objects
            exclude_fields: List of field names to exclude
            
        Returns:
            Dict[str, Any]: Dictionary representation of the model
        """
        exclude_fields = exclude_fields or []
        data = {}
        
        for field_name in self._meta.fields:
            if field_name in exclude_fields:
                continue
                
            field_value = getattr(self, field_name)
            
            # Handle datetime fields
            if isinstance(field_value, datetime):
                data[field_name] = field_value.isoformat()
            # Handle foreign key fields
            elif hasattr(field_value, 'id'):
                if include_relations:
                    # Include the full related object
                    data[field_name] = field_value.to_dict() if hasattr(field_value, 'to_dict') else str(field_value)
                else:
                    # Just include the ID
                    data[field_name] = field_value.id
            else:
                data[field_name] = field_value
        
        # Include computed properties if they exist
        if hasattr(self, '_computed_properties'):
            for prop_name in self._computed_properties:
                if hasattr(self, prop_name):
                    try:
                        data[prop_name] = getattr(self, prop_name)
                    except Exception as e:
                        logger.warning(f"Failed to compute property {prop_name}: {e}")
        
        return data
    
    def to_json(self, **kwargs) -> str:
        """
        Convert model instance to JSON string.
        
        Args:
            **kwargs: Arguments passed to to_dict()
            
        Returns:
            str: JSON representation of the model
        """
        data = self.to_dict(**kwargs)
        return json.dumps(data, ensure_ascii=False, indent=2)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any], validate: bool = True) -> 'SerializationMixin':
        """
        Create model instance from dictionary data with validation.
        
        Args:
            data: Dictionary containing model data
            validate: If True, validate the created instance
            
        Returns:
            Model instance
            
        Raises:
            ValidationError: If validation fails and validate=True
        """
        # Convert datetime strings back to datetime objects
        processed_data = {}
        
        for field_name in cls._meta.fields:
            if field_name in data:
                field = cls._meta.fields[field_name]
                field_value = data[field_name]
                
                # Handle datetime fields
                if hasattr(field, 'field_type') and 'datetime' in str(field.field_type).lower():
                    if isinstance(field_value, str):
                        try:
                            processed_data[field_name] = datetime.fromisoformat(field_value)
                        except ValueError:
                            logger.warning(f"Invalid datetime format for {field_name}: {field_value}")
                            processed_data[field_name] = datetime.now()
                    else:
                        processed_data[field_name] = field_value
                else:
                    processed_data[field_name] = field_value
        
        # Create instance
        instance = cls(**processed_data)
        
        # Validate if requested
        if validate and hasattr(instance, 'validate'):
            instance.validate(raise_exception=True)
        
        return instance
    
    @classmethod
    def from_json(cls, json_str: str, validate: bool = True) -> 'SerializationMixin':
        """
        Create model instance from JSON string.
        
        Args:
            json_str: JSON string containing model data
            validate: If True, validate the created instance
            
        Returns:
            Model instance
            
        Raises:
            ValidationError: If validation fails and validate=True
            json.JSONDecodeError: If JSON is invalid
        """
        data = json.loads(json_str)
        return cls.from_dict(data, validate=validate)


class FieldValidator:
    """
    Utility class for common field validation patterns.
    """
    
    @staticmethod
    def validate_discord_id(value: int, field_name: str = "discord_id") -> List[str]:
        """
        Validate a Discord ID (snowflake).
        
        Args:
            value: The ID to validate
            field_name: Name of the field for error messages
            
        Returns:
            List[str]: List of validation errors
        """
        errors = []
        
        if not isinstance(value, int):
            errors.append(f"{field_name} must be an integer")
            return errors
        
        if value <= 0:
            errors.append(f"{field_name} must be a positive integer")
        
        # Discord snowflakes are 64-bit integers
        if value > 2**63 - 1:
            errors.append(f"{field_name} exceeds maximum Discord ID value")
        
        # Discord snowflakes started around 2015, so very small values are likely invalid
        if value < 100000000000000000:  # Rough minimum for Discord IDs
            errors.append(f"{field_name} appears to be an invalid Discord ID")
        
        return errors
    
    @staticmethod
    def validate_emoji(value: str, field_name: str = "emoji") -> List[str]:
        """
        Validate an emoji string.
        
        Args:
            value: The emoji to validate
            field_name: Name of the field for error messages
            
        Returns:
            List[str]: List of validation errors
        """
        errors = []
        
        if not isinstance(value, str):
            errors.append(f"{field_name} must be a string")
            return errors
        
        if not value.strip():
            errors.append(f"{field_name} cannot be empty")
            return errors
        
        # Check for custom Discord emoji format <:name:id> or <a:name:id>
        custom_emoji_pattern = r'^<a?:[a-zA-Z0-9_]+:\d+>$'
        
        # Check if it's a custom emoji or a unicode emoji
        if not (re.match(custom_emoji_pattern, value) or len(value.encode('utf-8')) <= 4):
            errors.append(f"{field_name} must be a valid emoji")
        
        return errors
    
    @staticmethod
    def validate_interval_minutes(value: float, field_name: str = "interval_minutes") -> List[str]:
        """
        Validate a reminder interval in minutes.
        
        Args:
            value: The interval to validate
            field_name: Name of the field for error messages
            
        Returns:
            List[str]: List of validation errors
        """
        errors = []
        
        if not isinstance(value, (int, float)):
            errors.append(f"{field_name} must be a number")
            return errors
        
        if value <= 0:
            errors.append(f"{field_name} must be greater than 0")
        
        # Minimum interval: 1 minute
        if value < 1:
            errors.append(f"{field_name} must be at least 1 minute")
        
        # Maximum interval: 1 year (525600 minutes)
        if value > 525600:
            errors.append(f"{field_name} cannot exceed 1 year (525600 minutes)")
        
        return errors
    
    @staticmethod
    def validate_json_field(value: str, field_name: str = "json_field") -> List[str]:
        """
        Validate a JSON string field.
        
        Args:
            value: The JSON string to validate
            field_name: Name of the field for error messages
            
        Returns:
            List[str]: List of validation errors
        """
        errors = []
        
        if not isinstance(value, str):
            errors.append(f"{field_name} must be a string")
            return errors
        
        try:
            json.loads(value)
        except json.JSONDecodeError as e:
            errors.append(f"{field_name} contains invalid JSON: {e}")
        
        return errors


def validate_model_instance(instance, raise_exception: bool = False) -> List[str]:
    """
    Validate a model instance using all available validation methods.
    
    Args:
        instance: The model instance to validate
        raise_exception: If True, raise ValidationError on validation failure
        
    Returns:
        List[str]: List of validation error messages
        
    Raises:
        ValidationError: If raise_exception is True and validation fails
    """
    errors = []
    
    # Use the instance's validate method if available
    if hasattr(instance, 'validate'):
        errors.extend(instance.validate())
    
    if raise_exception and errors:
        raise ValidationError(errors)
    
    return errors