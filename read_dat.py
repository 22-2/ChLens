
import sys

def read_dat(file_path):
    with open(file_path, 'rb') as f:
        content = f.read()
    try:
        text = content.decode('shift_jis', errors='replace')
        lines = text.split('\n')
        for i, line in enumerate(lines[:10]):
            print(f"Line {i+1}: {line}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        read_dat(sys.argv[1])
    else:
        print("Usage: python read_dat.py <file_path>")
