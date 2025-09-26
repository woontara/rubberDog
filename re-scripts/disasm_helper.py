#!/usr/bin/env python3
"""
Disassembly Helper
A tool for disassembling binary code using Capstone

Usage: python disasm_helper.py <file> [options]
"""

import os
import sys
import argparse
from pathlib import Path
import capstone

class DisasmHelper:
    def __init__(self):
        self.architectures = {
            'x86': capstone.CS_ARCH_X86,
            'x64': capstone.CS_ARCH_X86,
            'arm': capstone.CS_ARCH_ARM,
            'arm64': capstone.CS_ARCH_ARM64,
            'mips': capstone.CS_ARCH_MIPS,
            'ppc': capstone.CS_ARCH_PPC,
            'sparc': capstone.CS_ARCH_SPARC
        }

        self.modes = {
            'x86': capstone.CS_MODE_32,
            'x64': capstone.CS_MODE_64,
            'arm': capstone.CS_MODE_ARM,
            'arm64': capstone.CS_MODE_ARM,
            'thumb': capstone.CS_MODE_THUMB,
            'mips32': capstone.CS_MODE_MIPS32,
            'mips64': capstone.CS_MODE_MIPS64,
            'ppc32': capstone.CS_MODE_32,
            'ppc64': capstone.CS_MODE_64
        }

    def load_file(self, file_path, offset=0, size=None):
        """Load binary data from file"""
        try:
            with open(file_path, 'rb') as f:
                f.seek(offset)
                if size:
                    data = f.read(size)
                else:
                    data = f.read()
            return data
        except Exception as e:
            print(f"Error loading file: {e}")
            return None

    def disassemble(self, data, arch='x64', start_addr=0x1000):
        """Disassemble binary data"""
        if arch not in self.architectures:
            print(f"Unsupported architecture: {arch}")
            return None

        try:
            # Set up Capstone disassembler
            cs_arch = self.architectures[arch]
            if arch == 'x64':
                cs_mode = capstone.CS_MODE_64
            elif arch == 'x86':
                cs_mode = capstone.CS_MODE_32
            elif arch == 'arm64':
                cs_mode = capstone.CS_MODE_ARM
            elif arch == 'arm':
                cs_mode = capstone.CS_MODE_ARM
            elif arch == 'thumb':
                cs_arch = capstone.CS_ARCH_ARM
                cs_mode = capstone.CS_MODE_THUMB
            else:
                cs_mode = capstone.CS_MODE_32

            md = capstone.Cs(cs_arch, cs_mode)
            md.detail = True  # Enable detailed information

            instructions = []
            for insn in md.disasm(data, start_addr):
                insn_info = {
                    'address': f"0x{insn.address:08x}",
                    'bytes': ' '.join(f'{b:02x}' for b in insn.bytes),
                    'mnemonic': insn.mnemonic,
                    'op_str': insn.op_str,
                    'size': insn.size
                }

                # Add detailed information if available
                if hasattr(insn, 'groups') and insn.groups:
                    insn_info['groups'] = [md.group_name(g) for g in insn.groups]

                if hasattr(insn, 'operands'):
                    operands = []
                    for op in insn.operands:
                        op_info = {'type': op.type}
                        if op.type == capstone.CS_OP_REG:
                            op_info['reg'] = insn.reg_name(op.reg)
                        elif op.type == capstone.CS_OP_IMM:
                            op_info['imm'] = f"0x{op.imm:x}"
                        elif op.type == capstone.CS_OP_MEM:
                            op_info['mem'] = {
                                'base': insn.reg_name(op.mem.base) if op.mem.base != 0 else None,
                                'index': insn.reg_name(op.mem.index) if op.mem.index != 0 else None,
                                'disp': op.mem.disp
                            }
                        operands.append(op_info)
                    insn_info['operands'] = operands

                instructions.append(insn_info)

            return instructions

        except Exception as e:
            print(f"Disassembly error: {e}")
            return None

    def find_functions(self, instructions):
        """Attempt to identify function boundaries"""
        functions = []
        current_func = None

        for i, insn in enumerate(instructions):
            # Function start patterns
            if (insn['mnemonic'] in ['push', 'mov'] and
                'ebp' in insn['op_str'] or 'rbp' in insn['op_str']):
                if current_func is None:
                    current_func = {
                        'start': insn['address'],
                        'instructions': []
                    }

            if current_func:
                current_func['instructions'].append(insn)

            # Function end patterns
            if insn['mnemonic'] in ['ret', 'retn']:
                if current_func:
                    current_func['end'] = insn['address']
                    current_func['size'] = len(current_func['instructions'])
                    functions.append(current_func)
                    current_func = None

        return functions

    def analyze_control_flow(self, instructions):
        """Analyze control flow (jumps, calls, etc.)"""
        control_flow = {
            'calls': [],
            'jumps': [],
            'branches': []
        }

        for insn in instructions:
            if insn['mnemonic'].startswith('call'):
                control_flow['calls'].append({
                    'from': insn['address'],
                    'instruction': f"{insn['mnemonic']} {insn['op_str']}"
                })
            elif insn['mnemonic'].startswith('j'):
                if insn['mnemonic'] == 'jmp':
                    control_flow['jumps'].append({
                        'from': insn['address'],
                        'instruction': f"{insn['mnemonic']} {insn['op_str']}"
                    })
                else:
                    control_flow['branches'].append({
                        'from': insn['address'],
                        'instruction': f"{insn['mnemonic']} {insn['op_str']}"
                    })

        return control_flow

    def print_disassembly(self, instructions, show_bytes=True, show_details=False):
        """Print formatted disassembly"""
        for insn in instructions:
            addr = insn['address']
            bytes_str = f"{insn['bytes']:<20}" if show_bytes else ""
            asm_str = f"{insn['mnemonic']} {insn['op_str']}"

            print(f"{addr}  {bytes_str} {asm_str}")

            if show_details and 'operands' in insn:
                for op in insn['operands']:
                    print(f"        Operand: {op}")

    def analyze_file(self, file_path, arch='x64', offset=0, size=None, start_addr=0x1000):
        """Analyze a binary file"""
        print(f"Analyzing: {file_path}")
        print(f"Architecture: {arch}")
        print(f"Start address: 0x{start_addr:08x}")
        print("=" * 60)

        # Load file
        data = self.load_file(file_path, offset, size)
        if not data:
            return

        print(f"Loaded {len(data)} bytes")

        # Disassemble
        instructions = self.disassemble(data, arch, start_addr)
        if not instructions:
            return

        print(f"Disassembled {len(instructions)} instructions")
        print()

        # Print disassembly
        print("[DISASSEMBLY]")
        self.print_disassembly(instructions)

        # Analyze control flow
        print("\\n[CONTROL FLOW ANALYSIS]")
        control_flow = self.analyze_control_flow(instructions)

        if control_flow['calls']:
            print(f"\\nFunction calls ({len(control_flow['calls'])}):")
            for call in control_flow['calls'][:10]:
                print(f"  {call['from']}: {call['instruction']}")

        if control_flow['jumps']:
            print(f"\\nUnconditional jumps ({len(control_flow['jumps'])}):")
            for jump in control_flow['jumps'][:10]:
                print(f"  {jump['from']}: {jump['instruction']}")

        if control_flow['branches']:
            print(f"\\nConditional branches ({len(control_flow['branches'])}):")
            for branch in control_flow['branches'][:10]:
                print(f"  {branch['from']}: {branch['instruction']}")

        # Find functions
        print("\\n[FUNCTION ANALYSIS]")
        functions = self.find_functions(instructions)
        print(f"Potential functions found: {len(functions)}")
        for i, func in enumerate(functions[:5]):
            print(f"  Function {i+1}: {func['start']} - {func.get('end', 'Unknown')} ({func['size']} instructions)")

def main():
    parser = argparse.ArgumentParser(description='Disassembly Helper')
    parser.add_argument('file', help='Binary file to disassemble')
    parser.add_argument('--arch', default='x64', choices=['x86', 'x64', 'arm', 'arm64', 'thumb', 'mips'],
                        help='Target architecture (default: x64)')
    parser.add_argument('--offset', type=int, default=0, help='File offset to start disassembly')
    parser.add_argument('--size', type=int, help='Number of bytes to disassemble')
    parser.add_argument('--addr', type=lambda x: int(x, 0), default=0x1000, help='Start address (default: 0x1000)')
    parser.add_argument('--bytes', action='store_true', help='Show instruction bytes')
    parser.add_argument('--details', action='store_true', help='Show detailed operand information')

    args = parser.parse_args()

    if not os.path.exists(args.file):
        print(f"Error: File '{args.file}' not found")
        sys.exit(1)

    helper = DisasmHelper()
    helper.analyze_file(args.file, args.arch, args.offset, args.size, args.addr)

if __name__ == "__main__":
    main()