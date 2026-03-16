import time
import os
import shutil

INBOX = "../vault/AI_Employee_Vault/Inbox"
NEEDS_ACTION = "../vault/AI_Employee_Vault/Needs_Action"

print("Watcher started...")

while True:
    files = os.listdir(INBOX)

    for file in files:
        source = os.path.join(INBOX, file)
        destination = os.path.join(NEEDS_ACTION, file)

        if os.path.isfile(source):
            shutil.move(source, destination)
            print(f"Moved {file} to Needs_Action")

    time.sleep(5)
