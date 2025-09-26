#!/usr/bin/env python3
"""
PE File Analyzer
A comprehensive tool for analyzing Portable Executable (PE) files

Usage: python pe_analyzer.py <pe_file>
"""

import os
import sys
import hashlib
import pefile
import magic
from datetime import datetime
from pathlib import Path
import argparse

class PEAnalyzer:
    def __init__(self, file_path):
        self.file_path = Path(file_path)
        self.pe = None
        self.file_data = None

    def load_file(self):
        """Load and parse the PE file"""
        try:
            self.file_data = self.file_path.read_bytes()
            self.pe = pefile.PE(str(self.file_path))
            return True
        except Exception as e:
            print(f"Error loading PE file: {e}")
            return False

    def basic_info(self):
        """Extract basic file information"""
        info = {
            'filename': self.file_path.name,
            'size': len(self.file_data),
            'md5': hashlib.md5(self.file_data).hexdigest(),
            'sha1': hashlib.sha1(self.file_data).hexdigest(),
            'sha256': hashlib.sha256(self.file_data).hexdigest(),
        }

        # File type detection
        try:
            info['file_type'] = magic.from_buffer(self.file_data[:1024])
        except:
            info['file_type'] = "Unknown"

        return info

    def pe_headers(self):
        """Extract PE header information"""
        headers = {}

        # DOS Header
        headers['dos_header'] = {
            'e_magic': hex(self.pe.DOS_HEADER.e_magic),
            'e_lfanew': hex(self.pe.DOS_HEADER.e_lfanew)
        }

        # NT Headers
        headers['nt_headers'] = {
            'signature': hex(self.pe.NT_HEADERS.Signature),
            'machine': hex(self.pe.FILE_HEADER.Machine),
            'number_of_sections': self.pe.FILE_HEADER.NumberOfSections,
            'time_date_stamp': datetime.fromtimestamp(self.pe.FILE_HEADER.TimeDateStamp),
            'size_of_optional_header': self.pe.FILE_HEADER.SizeOfOptionalHeader,
            'characteristics': hex(self.pe.FILE_HEADER.Characteristics)
        }

        # Optional Header
        headers['optional_header'] = {
            'magic': hex(self.pe.OPTIONAL_HEADER.Magic),
            'address_of_entry_point': hex(self.pe.OPTIONAL_HEADER.AddressOfEntryPoint),
            'image_base': hex(self.pe.OPTIONAL_HEADER.ImageBase),
            'section_alignment': hex(self.pe.OPTIONAL_HEADER.SectionAlignment),
            'file_alignment': hex(self.pe.OPTIONAL_HEADER.FileAlignment),
            'size_of_image': hex(self.pe.OPTIONAL_HEADER.SizeOfImage),
            'subsystem': self.pe.OPTIONAL_HEADER.Subsystem
        }

        return headers

    def sections(self):
        """Extract section information"""
        sections = []
        for section in self.pe.sections:
            sec_info = {
                'name': section.Name.decode('utf-8').rstrip('\\x00'),
                'virtual_address': hex(section.VirtualAddress),
                'virtual_size': hex(section.Misc_VirtualSize),
                'raw_size': hex(section.SizeOfRawData),
                'raw_address': hex(section.PointerToRawData),
                'characteristics': hex(section.Characteristics),
                'entropy': section.get_entropy()
            }
            sections.append(sec_info)
        return sections

    def imports(self):
        """Extract import table information"""
        imports = []
        try:
            for entry in self.pe.DIRECTORY_ENTRY_IMPORT:
                dll_info = {
                    'dll': entry.dll.decode('utf-8'),
                    'functions': []
                }
                for imp in entry.imports:
                    if imp.name:
                        dll_info['functions'].append(imp.name.decode('utf-8'))
                imports.append(dll_info)
        except AttributeError:
            pass
        return imports

    def exports(self):
        """Extract export table information"""
        exports = []
        try:
            for exp in self.pe.DIRECTORY_ENTRY_EXPORT.symbols:
                export_info = {
                    'name': exp.name.decode('utf-8') if exp.name else f"Ordinal_{exp.ordinal}",
                    'address': hex(exp.address),
                    'ordinal': exp.ordinal
                }
                exports.append(export_info)
        except AttributeError:
            pass
        return exports

    def resources(self):
        """Extract resource information"""
        resources = []
        try:
            for entry in self.pe.DIRECTORY_ENTRY_RESOURCE.entries:
                resource_info = {
                    'type': entry.id,
                    'name': entry.name.decode('utf-8') if entry.name else f"ID_{entry.id}",
                    'entries': len(entry.directory.entries) if hasattr(entry, 'directory') else 0
                }
                resources.append(resource_info)
        except AttributeError:
            pass
        return resources

    def security_features(self):
        """Check for security features"""
        features = {
            'aslr': bool(self.pe.OPTIONAL_HEADER.DllCharacteristics & 0x0040),
            'dep': bool(self.pe.OPTIONAL_HEADER.DllCharacteristics & 0x0100),
            'seh': bool(self.pe.OPTIONAL_HEADER.DllCharacteristics & 0x0400),
            'cfg': bool(self.pe.OPTIONAL_HEADER.DllCharacteristics & 0x4000),
            'signed': False  # Would need to check digital signature
        }
        return features

    def analyze(self):
        """Perform complete analysis"""
        if not self.load_file():
            return None

        analysis = {
            'basic_info': self.basic_info(),
            'pe_headers': self.pe_headers(),
            'sections': self.sections(),
            'imports': self.imports(),
            'exports': self.exports(),
            'resources': self.resources(),
            'security_features': self.security_features()
        }

        return analysis

    def print_analysis(self, analysis):
        """Print formatted analysis results"""
        print("=" * 60)
        print(f"PE Analysis Report for: {analysis['basic_info']['filename']}")
        print("=" * 60)

        # Basic Info
        print("\\n[BASIC INFORMATION]")
        for key, value in analysis['basic_info'].items():
            print(f"  {key:15}: {value}")

        # PE Headers
        print("\\n[PE HEADERS]")
        for header_type, header_data in analysis['pe_headers'].items():
            print(f"  {header_type.upper()}:")
            for key, value in header_data.items():
                print(f"    {key:25}: {value}")

        # Sections
        print("\\n[SECTIONS]")
        for i, section in enumerate(analysis['sections']):
            print(f"  Section {i+1}:")
            for key, value in section.items():
                print(f"    {key:15}: {value}")
            print()

        # Imports
        print("\\n[IMPORTS]")
        for dll in analysis['imports']:
            print(f"  {dll['dll']}:")
            for func in dll['functions'][:10]:  # Limit to first 10 functions
                print(f"    - {func}")
            if len(dll['functions']) > 10:
                print(f"    ... and {len(dll['functions']) - 10} more")
            print()

        # Exports
        if analysis['exports']:
            print("\\n[EXPORTS]")
            for exp in analysis['exports'][:20]:  # Limit to first 20 exports
                print(f"  {exp['name']} @ {exp['address']} (Ordinal: {exp['ordinal']})")

        # Security Features
        print("\\n[SECURITY FEATURES]")
        for feature, enabled in analysis['security_features'].items():
            status = "Enabled" if enabled else "Disabled"
            print(f"  {feature.upper():10}: {status}")

def main():
    parser = argparse.ArgumentParser(description='PE File Analyzer')
    parser.add_argument('file', help='Path to PE file to analyze')
    parser.add_argument('-o', '--output', help='Output file for analysis report')
    args = parser.parse_args()

    if not os.path.exists(args.file):
        print(f"Error: File '{args.file}' not found")
        sys.exit(1)

    analyzer = PEAnalyzer(args.file)
    analysis = analyzer.analyze()

    if analysis:
        if args.output:
            # Save to file
            with open(args.output, 'w') as f:
                import json
                json.dump(analysis, f, indent=2, default=str)
            print(f"Analysis saved to {args.output}")
        else:
            # Print to console
            analyzer.print_analysis(analysis)
    else:
        print("Analysis failed")

if __name__ == "__main__":
    main()