"""
Shared XML utilities for the Sanctions Screening System

This module contains common XML processing functions used by multiple
components to avoid code duplication.
"""

import logging
from pathlib import Path
from typing import Optional, Any
import xml.etree.ElementTree as ET

logger = logging.getLogger(__name__)


def extract_xml_namespace(xml_path: Path) -> str:
    """Dynamically extract namespace from XML root element
    
    This function reads the first element of an XML file to determine
    its namespace. It handles both namespaced and non-namespaced XML files.
    
    Args:
        xml_path: Path to the XML file
        
    Returns:
        Namespace string with curly braces (e.g., '{http://...}') or empty string
        
    Example:
        >>> ns = extract_xml_namespace(Path('sdn_enhanced.xml'))
        >>> print(ns)
        '{https://sanctionslistservice.ofac.treas.gov/api/...}'
    """
    try:
        with open(xml_path, 'rb') as f:
            for event, elem in ET.iterparse(f, events=('start',)):
                tag = elem.tag
                if tag.startswith('{'):
                    ns_end = tag.index('}')
                    namespace = tag[:ns_end + 1]
                    logger.debug(f"Extracted namespace from {xml_path.name}: {namespace}")
                    return namespace
                break
    except FileNotFoundError:
        logger.error(f"XML file not found: {xml_path}")
    except ET.ParseError as e:
        logger.error(f"XML parse error in {xml_path}: {e}")
    except Exception as e:
        logger.warning(f"Could not extract namespace from {xml_path}: {e}")
    
    return ''


def get_text_from_element(elem: Any, path: str) -> Optional[str]:
    """Safely get text content from an XML element
    
    Args:
        elem: Parent XML element
        path: XPath-style path to child element
        
    Returns:
        Stripped text content or None if element not found or empty
    """
    child = elem.find(path)
    if child is not None and child.text:
        return child.text.strip()
    return None


def count_elements(xml_path: Path, element_name: str, namespace: str = '') -> int:
    """Count occurrences of an element in an XML file
    
    Uses iterparse for memory-efficient counting of large files.
    
    Args:
        xml_path: Path to XML file
        element_name: Name of element to count
        namespace: XML namespace (with curly braces)
        
    Returns:
        Count of elements found
    """
    count = 0
    full_tag = f'{namespace}{element_name}'
    
    try:
        for event, elem in ET.iterparse(xml_path, events=('end',)):
            if elem.tag == full_tag:
                count += 1
                elem.clear()  # Free memory
    except Exception as e:
        logger.error(f"Error counting elements in {xml_path}: {e}")
    
    return count
