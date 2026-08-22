import json, os

path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data.json')
data = [
  {"time": "2026-08-21 15:20:51", "j": 28.3, "k": 52.2, "x": None, "y": None, "n": None, "g": "N", "mode": "N", "i": None, "q": None, "r": None, "v": None, "a": None, "t": None, "h": None, "b": None, "d": None, "l": None, "wind": None, "e": 0},
  {"time": "2026-08-21 15:47:37", "mode": "N", "i": 103, "q": 1, "r": 1, "e": 16, "v": 13.4, "a": 45.5, "t": 28.43, "h": 49.14, "b": 1002.8, "d": 0.0, "l": 20, "wind": 0.04, "j": 27.2, "k": 54.7, "x": None, "y": None, "n": None, "g": "N"}
]
with open(path, 'w', encoding='utf-8', newline='') as f:
    json.dump(data, f, ensure_ascii=False, separators=(', ', ': '))
print('records', len(data))
