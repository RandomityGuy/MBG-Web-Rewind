import os;
import shutil;
import datetime;
import glob;

main_path = os.path.abspath(".");
db_path = os.path.join(main_path,"storage","leaderboards.db")

MAX_COPIES = 5;
print(db_path);
if (os.path.exists(db_path)):
    print("Backing up");
    shutil.copyfile(db_path,os.path.join(main_path,"storage","leaderboards" + str(int(datetime.datetime.now().timestamp())) + ".bak.db"));

file_list = glob.glob(os.path.join(main_path,"storage","*.bak.db"));
full_path = [os.path.abspath(x) for x in file_list];

if len(file_list) > MAX_COPIES:
    oldest_file = min(full_path, key=os.path.getctime)
    os.remove(oldest_file)