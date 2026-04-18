import sys
content = open('h:/Ali/Alpharia-main - speech/js/teacher-progress.js', encoding='utf-8').read()

stack = []
in_string = False
string_char = ''
in_comment = False
in_multiline = False

i = 0
while i < len(content):
    c = content[i]
    if in_string:
        if c == '\\': i += 1
        elif c == string_char: in_string = False
    elif in_comment:
        if c == '\n': in_comment = False
    elif in_multiline:
        if c == '*' and i + 1 < len(content) and content[i+1] == '/':
            in_multiline = False; i += 1
    else:
        if c in ['\'', '"', '`']:
            in_string = True; string_char = c
        elif c == '/' and i + 1 < len(content) and content[i+1] == '/':
            in_comment = True; i += 1
        elif c == '/' and i + 1 < len(content) and content[i+1] == '*':
            in_multiline = True; i += 1
        elif c in ['{', '(', '[']:
            stack.append((c, i))
        elif c in ['}', ')', ']']:
            if not stack:
                print(f'Extra {c} at {i}')
            else:
                top = stack.pop()
                expected = {'{':'}', '(':')', '[':']'}[top[0]]
                if c != expected:
                    print(f'Mismatch: expected {expected} but got {c} at {i}. Opened at {top[1]}')
    i += 1

if stack:
    print('Unclosed:', stack)
elif in_string:
    print('Unclosed string starting with', string_char)
else:
    print('Syntax looks fully balanced!')
