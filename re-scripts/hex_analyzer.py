#!/usr/bin/env python3
"""
Hex File Analyzer
A tool for analyzing binary files in hexadecimal format

Usage: python hex_analyzer.py <file>
"""

import os
import sys
import argparse
import struct
import string
from pathlib import Path
import magic

class HexAnalyzer:
    def __init__(self, file_path):
        self.file_path = Path(file_path)
        self.data = None

    def load_file(self):
        """Load file data"""
        try:
            with open(self.file_path, 'rb') as f:
                self.data = f.read()
            return True
        except Exception as e:
            print(f"Error loading file: {e}")
            return False

    def hex_dump(self, start=0, length=None, width=16):
        """Create a hex dump of the file"""
        if not self.data:
            return None

        if length is None:
            length = len(self.data) - start

        end = min(start + length, len(self.data))

        for i in range(start, end, width):
            # Address
            addr = f"{i:08x}"

            # Hex values
            hex_vals = []
            ascii_vals = []

            for j in range(width):
                if i + j < end:
                    byte = self.data[i + j]
                    hex_vals.append(f"{byte:02x}")
                    # ASCII representation
                    if 32 <= byte <= 126:
                        ascii_vals.append(chr(byte))
                    else:
                        ascii_vals.append('.')
                else:
                    hex_vals.append("  ")
                    ascii_vals.append(" ")

            # Format output
            hex_str = " ".join(hex_vals[:8]) + "  " + " ".join(hex_vals[8:])
            ascii_str = "".join(ascii_vals)

            print(f"{addr}  {hex_str:<48} |{ascii_str}|")

    def find_strings(self, min_length=4):
        """Find printable strings in the binary"""
        if not self.data:
            return []

        strings = []
        current_string = ""
        start_offset = 0

        for i, byte in enumerate(self.data):
            if chr(byte) in string.printable and chr(byte) not in "\\t\\n\\r\\x0b\\x0c":
                if not current_string:
                    start_offset = i
                current_string += chr(byte)
            else:
                if len(current_string) >= min_length:
                    strings.append({
                        'offset': start_offset,
                        'string': current_string,
                        'length': len(current_string)
                    })
                current_string = ""

        # Check last string
        if len(current_string) >= min_length:
            strings.append({
                'offset': start_offset,
                'string': current_string,
                'length': len(current_string)
            })

        return strings

    def find_pattern(self, pattern):
        """Find a specific byte pattern in the file"""
        if not self.data:
            return []

        if isinstance(pattern, str):
            # Convert hex string to bytes
            pattern = bytes.fromhex(pattern.replace(' ', ''))

        matches = []
        start = 0
        while True:
            pos = self.data.find(pattern, start)
            if pos == -1:
                break
            matches.append(pos)
            start = pos + 1

        return matches

    def entropy_analysis(self, block_size=256):
        """Calculate entropy for blocks of data"""
        import math
        from collections import Counter

        if not self.data:
            return []

        entropies = []
        for i in range(0, len(self.data), block_size):
            block = self.data[i:i + block_size]
            if not block:
                continue

            # Count byte frequencies
            freq = Counter(block)
            length = len(block)

            # Calculate entropy
            entropy = 0.0
            for count in freq.values():
                p = count / length
                entropy -= p * math.log2(p)

            entropies.append({
                'offset': i,
                'entropy': entropy,
                'high_entropy': entropy > 7.0  # High entropy threshold
            })

        return entropies

    def file_header_analysis(self):
        """Analyze file headers and magic bytes"""
        if not self.data:
            return None

        # Get first 1024 bytes for analysis
        header = self.data[:1024]

        info = {
            'size': len(self.data),
            'first_16_bytes': ' '.join(f'{b:02x}' for b in header[:16]),
            'magic_signature': None,
            'file_type': None
        }

        # Common file signatures
        signatures = {
            b'\\x4d\\x5a': 'PE/DOS Executable',
            b'\\x7f\\x45\\x4c\\x46': 'ELF',
            b'\\xfe\\xed\\xfa\\xce': 'Mach-O (32-bit)',
            b'\\xfe\\xed\\xfa\\xcf': 'Mach-O (64-bit)',
            b'\\x50\\x4b\\x03\\x04': 'ZIP/JAR/APK',
            b'\\x89\\x50\\x4e\\x47': 'PNG',
            b'\\xff\\xd8\\xff': 'JPEG',
            b'\\x47\\x49\\x46\\x38': 'GIF',
            b'\\x25\\x50\\x44\\x46': 'PDF',
            b'\\xd0\\xcf\\x11\\xe0': 'Microsoft Office',
            b'\\x52\\x61\\x72\\x21': 'RAR Archive'
        }

        for sig, desc in signatures.items():
            if header.startswith(sig):
                info['magic_signature'] = desc
                break

        # Use python-magic for file type detection
        try:
            info['file_type'] = magic.from_buffer(header)
        except:
            info['file_type'] = "Unknown"

        return info

    def data_structures(self):
        """Look for common data structures"""
        if not self.data:
            return {}

        structures = {
            'possible_pointers': [],
            'aligned_data': [],
            'repeated_patterns': []
        }

        # Look for 32-bit aligned values that could be pointers
        for i in range(0, len(self.data) - 4, 4):
            value = struct.unpack('<I', self.data[i:i+4])[0]
            # Check if value looks like a typical memory address
            if 0x400000 <= value <= 0x7FFFFFFF or 0x10000000 <= value <= 0x7FFFFFFF:
                structures['possible_pointers'].append({
                    'offset': i,
                    'value': f'0x{value:08x}'
                })

        return structures

    def analyze(self):
        """Perform complete analysis"""
        if not self.load_file():
            return None

        print(f"Analyzing file: {self.file_path}")
        print("=" * 60)

        # File header analysis
        header_info = self.file_header_analysis()
        print("\\n[FILE INFORMATION]")
        print(f"  Size: {header_info['size']} bytes")
        print(f"  Type: {header_info['file_type']}")
        print(f"  Magic: {header_info['magic_signature'] or 'Unknown'}")
        print(f"  Header: {header_info['first_16_bytes']}")

        # Hex dump (first 256 bytes)
        print("\\n[HEX DUMP - First 256 bytes]")
        self.hex_dump(0, 256)

        # Strings
        print("\\n[STRINGS]")
        strings = self.find_strings()
        for s in strings[:20]:  # Show first 20 strings
            print(f"  0x{s['offset']:08x}: {s['string'][:50]}")
        if len(strings) > 20:
            print(f"  ... and {len(strings) - 20} more strings")

        # Entropy analysis
        print("\\n[ENTROPY ANALYSIS]")
        entropies = self.entropy_analysis()
        high_entropy_blocks = [e for e in entropies if e['high_entropy']]
        print(f"  Total blocks analyzed: {len(entropies)}")
        print(f"  High entropy blocks: {len(high_entropy_blocks)}")

        if high_entropy_blocks:
            print("  High entropy regions (possible encryption/compression):")
            for block in high_entropy_blocks[:10]:
                print(f"    0x{block['offset']:08x}: {block['entropy']:.2f}")

        # Data structures
        print("\\n[POTENTIAL DATA STRUCTURES]")
        structures = self.data_structures()
        if structures['possible_pointers']:
            print(f"  Possible pointers found: {len(structures['possible_pointers'])}")
            for ptr in structures['possible_pointers'][:10]:
                print(f"    0x{ptr['offset']:08x}: {ptr['value']}")

def main():
    parser = argparse.ArgumentParser(description='Hex File Analyzer')
    parser.add_argument('file', help='Path to file to analyze')
    parser.add_argument('--dump', '-d', action='store_true', help='Show hex dump only')
    parser.add_argument('--strings', '-s', action='store_true', help='Show strings only')
    parser.add_argument('--start', type=int, default=0, help='Start offset for hex dump')
    parser.add_argument('--length', type=int, help='Length for hex dump')
    args = parser.parse_args()

    if not os.path.exists(args.file):
        print(f"Error: File '{args.file}' not found")
        sys.exit(1)

    analyzer = HexAnalyzer(args.file)

    if args.dump:
        analyzer.load_file()
        analyzer.hex_dump(args.start, args.length)
    elif args.strings:
        analyzer.load_file()
        strings = analyzer.find_strings()
        for s in strings:
            print(f"0x{s['offset']:08x}: {s['string']}")
    else:
        analyzer.analyze()

if __name__ == "__main__":
    main()