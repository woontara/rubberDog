# Reverse Engineering Environment

A comprehensive reverse engineering setup for Windows with Python-based analysis tools and optional external tool integration.

## 🛠️ Environment Structure

```
ReversePE/
├── re-tools/           # External tools and installers
│   └── install_tools.bat
├── re-scripts/         # Python analysis scripts
│   ├── pe_analyzer.py
│   ├── hex_analyzer.py
│   ├── disasm_helper.py
│   ├── malware_scanner.py
│   └── README.md
├── re-samples/         # Sample files for testing
├── re-workspace/       # Working directory for analysis
├── re-reports/         # Analysis reports output
├── requirements-re-minimal.txt
└── setup_environment.bat
```

## 🚀 Quick Setup

### Automatic Setup (Recommended)
```bash
# Run the automated setup script
setup_environment.bat
```

### Manual Setup
```bash
# 1. Install Python packages
pip install -r requirements-re-minimal.txt

# 2. Verify installation
python re-scripts/pe_analyzer.py --help
```

## 📦 Installed Python Tools

### Core Analysis Libraries
- **pefile** - PE file analysis
- **pyelftools** - ELF file analysis
- **capstone** - Multi-architecture disassembly
- **python-magic-bin** - File type detection
- **cryptography** - Cryptographic functions

### Analysis Scripts

#### 1. PE Analyzer (`pe_analyzer.py`)
Comprehensive Windows executable analysis:
- File hashes and basic info
- PE headers (DOS, NT, Optional)
- Section analysis with entropy
- Import/Export tables
- Resource analysis
- Security features (ASLR, DEP, CFG)

```bash
python re-scripts/pe_analyzer.py sample.exe
python re-scripts/pe_analyzer.py sample.exe -o report.json
```

#### 2. Hex Analyzer (`hex_analyzer.py`)
Binary file examination in hexadecimal:
- Formatted hex dumps
- String extraction
- Pattern searching
- Entropy analysis
- File structure identification

```bash
python re-scripts/hex_analyzer.py unknown_file
python re-scripts/hex_analyzer.py --strings binary.dat
python re-scripts/hex_analyzer.py --dump file.bin --start 0x100 --length 512
```

#### 3. Disassembly Helper (`disasm_helper.py`)
Multi-architecture disassembly:
- x86/x64, ARM, MIPS support
- Control flow analysis
- Function detection
- Instruction details

```bash
python re-scripts/disasm_helper.py binary.exe --arch x64
python re-scripts/disasm_helper.py code.bin --arch arm --addr 0x1000
```

#### 4. Malware Scanner (`malware_scanner.py`)
Basic threat detection (defensive only):
- Suspicious API detection
- String pattern analysis
- Network indicators
- Risk scoring

```bash
python re-scripts/malware_scanner.py suspicious.exe
python re-scripts/malware_scanner.py sample.dll --json
```

## 🔧 Optional External Tools

Run `re-tools/install_tools.bat` as Administrator to install:

### Essential Tools
- **HxD** - Professional hex editor
- **x64dbg** - Windows debugger
- **Process Monitor** - Real-time file/registry monitoring
- **Process Explorer** - Advanced process viewer

### Advanced Tools
- **Ghidra** - NSA's reverse engineering suite
- **Radare2** - Command-line RE framework
- **Detect It Easy** - File analysis and packer detection
- **PE-bear** - PE file analysis GUI

### Network Analysis
- **Wireshark** - Network protocol analyzer

## 📋 Analysis Workflow

### 1. Initial Reconnaissance
```bash
# Identify file type and basic properties
python re-scripts/hex_analyzer.py unknown_file

# Calculate hashes for tracking
python re-scripts/pe_analyzer.py sample.exe | findstr "MD5\|SHA"
```

### 2. Static Analysis
```bash
# Comprehensive PE analysis
python re-scripts/pe_analyzer.py sample.exe > re-reports/pe_analysis.txt

# Check for suspicious patterns
python re-scripts/malware_scanner.py sample.exe > re-reports/threat_scan.txt
```

### 3. Code Analysis
```bash
# Disassemble entry point or specific sections
python re-scripts/disasm_helper.py sample.exe --arch x64 --addr 0x401000

# Extract and analyze strings
python re-scripts/hex_analyzer.py --strings sample.exe > re-reports/strings.txt
```

### 4. Dynamic Analysis (External Tools)
```bash
# Monitor file/registry activity
procmon.exe

# Debug execution
x64dbg.exe sample.exe

# Analyze in Ghidra for advanced RE
ghidra
```

## 🛡️ Security Guidelines

### ⚠️ Important Safety Rules

1. **Isolated Environment**: Always analyze unknown files in VMs or sandboxes
2. **Defensive Only**: Tools are for defense and education, not creating threats
3. **Legal Compliance**: Only analyze files you own or have permission to examine
4. **Backup Data**: Keep clean backups before analyzing potentially malicious files

### Recommended VM Setup
- **Windows 10/11** in VMware/VirtualBox
- **Snapshots** before analysis sessions
- **Network isolation** for dynamic analysis
- **Antivirus disabled** temporarily during analysis

## 🎯 Common Analysis Scenarios

### Malware Analysis
```bash
# 1. Static triage
python re-scripts/malware_scanner.py sample.exe

# 2. Structure analysis
python re-scripts/pe_analyzer.py sample.exe

# 3. String analysis
python re-scripts/hex_analyzer.py --strings sample.exe

# 4. Disassembly of key functions
python re-scripts/disasm_helper.py sample.exe --arch x64
```

### Software Reverse Engineering
```bash
# 1. Understand file structure
python re-scripts/pe_analyzer.py target.exe

# 2. Find interesting strings/functions
python re-scripts/hex_analyzer.py --strings target.exe | findstr -i "license\|key\|password"

# 3. Disassemble specific functions
python re-scripts/disasm_helper.py target.exe --addr 0x401000 --size 512
```

### File Format Analysis
```bash
# 1. Examine file structure
python re-scripts/hex_analyzer.py unknown_format.dat

# 2. Pattern detection
python re-scripts/hex_analyzer.py unknown_format.dat | findstr "Magic\|Header"

# 3. Extract embedded data
python re-scripts/hex_analyzer.py --dump unknown_format.dat --start 0x200
```

## 🔍 Advanced Features

### Entropy Analysis
High entropy regions often indicate:
- Compressed data
- Encrypted content
- Packed executables
- Obfuscated code

### Control Flow Analysis
Identifies:
- Function boundaries
- Call relationships
- Jump patterns
- Exception handlers

### Import/Export Analysis
Reveals:
- API dependencies
- System interactions
- Functionality hints
- Library usage

## 📚 Learning Resources

### Books
- "Practical Malware Analysis" by Sikorski & Honig
- "The IDA Pro Book" by Eagle
- "Reversing: Secrets of Reverse Engineering" by Eldad Eilam

### Online Resources
- [SANS Reverse Engineering](https://www.sans.org/cyber-security-courses/reverse-engineering-malware-malware-analysis-tools-techniques/)
- [Ghidra Documentation](https://ghidra-sre.org/)
- [Radare2 Book](https://book.rada.re/)

### Practice Platforms
- [Crackmes.one](https://crackmes.one/)
- [Root-Me Cracking](https://www.root-me.org/)
- [Flare-On Challenge](https://flare-on.com/)

## 🐛 Troubleshooting

### Common Issues

1. **Import Errors**: Run `pip install -r requirements-re-minimal.txt`
2. **Permission Denied**: Run as Administrator or check file permissions
3. **Path Issues**: Run `setup_environment.bat` to configure paths
4. **Tool Not Found**: Install external tools via `re-tools/install_tools.bat`

### Getting Help

```bash
# Script help
python re-scripts/script_name.py --help

# Check Python environment
python --version
pip list | findstr pefile
```

## 🤝 Contributing

To add new analysis scripts:

1. Place in `re-scripts/` directory
2. Follow existing naming convention
3. Include `--help` option
4. Add documentation to `re-scripts/README.md`
5. Test with sample files

## 📄 License

Educational and defensive security use only. Follow all applicable laws and regulations.

---

**Remember**: This environment is designed for legitimate security research, malware defense, and educational purposes. Always operate within legal boundaries and ethical guidelines.