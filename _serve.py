import os
import socket
import http.server
import socketserver

socket.getfqdn = lambda name='': 'localhost'
os.chdir(r'C:\Users\sxxsh\Documents\GitHub\antarctic-dashboard')
httpd = socketserver.TCPServer(('127.0.0.1', 8765), http.server.SimpleHTTPRequestHandler)
httpd.serve_forever()
