# Reverse Engineering Scripts

This directory contains Python scripts for reverse engineering and binary analysis tasks.

## Scripts Overview

### 1. pe_analyzer.py
**Purpose**: Comprehensive PE (Portable Executable) file analysis
**Features**:
- File information (hashes, size, type)
- PE headers analysis (DOS, NT, Optional)
- Section analysis with entropy calculation
- Import/Export table extraction
- Resource analysis
- Security features detection (ASLR, DEP, SEH, CFG)

**Usage**:
```bash
python pe_analyzer.py <pe_file>
python pe_analyzer.py sample.exe -o report.json
```

### 2. hex_analyzer.py
**Purpose**: Hexadecimal file analysis and data exploration
**Features**:
- Hex dump generation
- String extraction
- Pattern searching
- Entropy analysis
- File header analysis
- Data structure identification

**Usage**:
```bash
python hex_analyzer.py <file>
python hex_analyzer.py --dump <file>
python hex_analyzer.py --strings <file>
python hex_analyzer.py <file> --start 0x1000 --length 512
```

### 3. disasm_helper.py
**Purpose**: Disassembly tool using Capstone engine
**Features**:
- Multi-architecture support (x86, x64, ARM, MIPS, etc.)
- Control flow analysis
- Function boundary detection
- Detailed instruction analysis

**Usage**:
```bash
python disasm_helper.py <binary_file>
python disasm_helper.py sample.bin --arch x64 --addr 0x401000
python disasm_helper.py code.bin --arch arm --offset 0x100 --size 512
```

### 4. malware_scanner.py
**Purpose**: Basic malware detection and analysis (defensive only)
**Features**:
- Suspicious API detection
- String pattern analysis
- Network indicator extraction
- Crypto pattern identification
- Risk score calculation
- File type verification

**Usage**:
```bash
python malware_scanner.py <file>
python malware_scanner.py suspicious.exe --json
```

## Requirements

All scripts require the packages installed via:
```bash
pip install -r requirements-re-minimal.txt
```

Core dependencies:
- pefile (PE analysis)
- pyelftools (ELF analysis)
- capstone (disassembly)
- python-magic-bin (file type detection)
- cryptography (crypto functions)

## Security Notice

⚠️ **Important**: These tools are designed for:
- **Defensive security analysis**
- **Educational purposes**
- **Legitimate reverse engineering**

Do NOT use these tools for:
- Creating malware
- Unauthorized system access
- Illegal activities

## Usage Examples

### Analyzing a Windows Executable
```bash
# Get basic PE information
python pe_analyzer.py program.exe

# Examine the hex dump
python hex_analyzer.py program.exe

# Disassemble entry point
python disasm_helper.py program.exe --arch x64 --addr 0x401000

# Check for suspicious patterns
python malware_scanner.py program.exe
```

### Analyzing Unknown Binary
```bash
# Start with hex analysis to understand file type
python hex_analyzer.py unknown_file

# If it's executable, analyze structure
python pe_analyzer.py unknown_file

# Disassemble interesting sections
python disasm_helper.py unknown_file --offset 0x1000 --size 1024

# Check for malicious indicators
python malware_scanner.py unknown_file
```

## Tips for Effective Analysis

1. **Start with file identification**: Use hex_analyzer.py to understand what you're dealing with
2. **Check file integrity**: Always calculate and verify hashes
3. **Use multiple approaches**: Combine static analysis with dynamic analysis
4. **Document findings**: Keep detailed notes of your analysis process
5. **Stay safe**: Always analyze suspicious files in isolated environments

## Architecture Support

### Disassembly (disasm_helper.py)
- x86 (32-bit Intel/AMD)
- x64 (64-bit Intel/AMD)
- ARM (32-bit ARM)
- ARM64 (64-bit ARM/AArch64)
- MIPS (32/64-bit MIPS)
- PowerPC
- SPARC

### File Formats
- PE (Windows executables)
- ELF (Linux executables)
- Raw binary data
- Any file type (hex analysis)

## Output Formats

Most scripts support multiple output formats:
- **Console**: Human-readable formatted output
- **JSON**: Machine-readable structured data
- **Files**: Save analysis results to files

## Integration with Other Tools

These scripts work well with:
- **Ghidra**: Use scripts for initial analysis, then import to Ghidra
- **IDA Pro**: Generate initial reports before detailed analysis
- **x64dbg**: Use static analysis to guide dynamic analysis
- **Wireshark**: Network indicators can guide packet analysis
- **VirusTotal**: Compare hashes and indicators with threat intelligence

## Troubleshooting

### Common Issues

1. **"Module not found" errors**: Install requirements with `pip install -r requirements-re-minimal.txt`
2. **Permission errors**: Make sure you have read access to the files
3. **Encoding errors**: Some files may contain binary data that doesn't display properly
4. **Architecture detection**: For disassembly, you may need to specify the correct architecture manually

### Getting Help

Each script includes built-in help:
```bash
python script_name.py --help
```

For detailed documentation and examples, refer to the comments within each script.