from flask import Flask,render_template,url_for,Response,jsonify,request,redirect;
import os;
import requests;
from zipfile import ZipFile;
import io;
import json;
import datetime;
import sqlite3;

main_path = os.path.abspath(".");

USE_PROXY_ASSETS = True;

app = Flask(__name__,static_folder="",template_folder=main_path);

@app.route('/')
def main():
    with open(os.path.join(main_path,"index.html")) as f:
        return f.read();

@app.route('/assets/<path:varargs>')
def assets(varargs):
    varargs = varargs.split('/');
    path = os.path.join(main_path,"assets",*varargs);
    with open(path,"rb") as f:
        return f.read();

@app.route('/bundles/<path:varargs>')
def bundles(varargs):
    varargs = varargs.split('/');
    path = os.path.join(main_path,"bundles",*varargs);
    with open(path,"rb") as f:
        if (".js" in path):
            return Response(f.read(),mimetype = "application/javascript");
        if (".css" in path):
            return Response(f.read(),mimetype = "text/css");            
        return f.read();

@app.route('/css/<path:varargs>')
def css(varargs):
    varargs = varargs.split('/');
    path = os.path.join(main_path,"css",*varargs);
    with open(path,"rb") as f:
        return Response(f.read(),mimetype = "text/css");

@app.route('/js/<path:varargs>')
def js(varargs):
    varargs = varargs.split('/');
    path = os.path.join(main_path,"js",*varargs);
    with open(path,"rb") as f:
        return Response(f.read(),mimetype = "application/javascript");

@app.route('/lib/<path:varargs>')
def lib(varargs):
    varargs = varargs.split('/');
    path = os.path.join(main_path,"lib",*varargs);
    with open(path,"rb") as f:
        return Response(f.read(),mimetype = "application/javascript");

def scan_directory(path):
    dirstruct = os.listdir(path);
    ret = {};

    for file in dirstruct:
        ret[file] = None;
        if (os.path.isdir(os.path.join(path,file))):
            ret[file] = scan_directory(os.path.join(path,file));

    return ret;

@app.route('/php/get_directory_structure.php')
def get_directory_structure():
    return jsonify(scan_directory(os.path.join(main_path,"assets","data")));

@app.route('/php/get_custom_level_bitmap.php')
def get_custom_level_bitmap():
    id = request.args.get('id');
    url = f"https://cla.higuy.me/api/v1/missions/{id}/bitmap?width=258&height=194"
    return Response(requests.get(url).content,headers={"Content-Type":'Content-Type: image/jpeg'});

def setup_db():
    lb = sqlite3.connect(os.path.join(main_path,'storage','leaderboards.db'));
    cur = lb.cursor();
    cur.execute('''
    CREATE TABLE scores(
    mission varchar(256),
    score float,
    username varchar(256)
    );
    ''');
    cur.close();
    lb.commit();
    lb.close();

def get_scores(mission,count):
    lb = sqlite3.connect(os.path.join(main_path,'storage','leaderboards.db'));
    cur = lb.cursor();
    results = cur.execute("SELECT username,score FROM scores WHERE mission=? ORDER BY score ASC LIMIT ?;",(mission,count));
    data = [];
    for tup in results:
        data.append([tup[0],tup[1]]);
    cur.close();
    lb.close();
    return data;

def save_score(mission,username,score):
    lb = sqlite3.connect(os.path.join(main_path,'storage','leaderboards.db'));
    cur = lb.cursor();
    res = cur.execute("SELECT username,score FROM scores WHERE (mission=? AND username=?);",(mission,username)).fetchall();
    if (len(res) <= 0):
        cur.execute("INSERT INTO scores VALUES(?,?,?);",(mission,score,username));
    else:
        cur.execute("UPDATE scores SET score=? WHERE (mission=? AND username=?);",(score,mission,username));
    lb.commit();
    cur.close();
    lb.close();


@app.route('/php/get_custom_level.php')
def get_custom_level():
    id = request.args.get('id');
    if (id == None):
        return;
    
    if (USE_PROXY_ASSETS):
        resp = requests.get(f"http://marbleblast.vani.ga/php/get_custom_level.php?id={id}");
        return resp.content;
    
    if (not os.path.isdir(os.path.join(main_path,'storage','customs'))):
        os.mkdir(os.path.join(main_path,'storage','customs'));

    zip = os.path.join(main_path,'storage','customs',"zip" + str(id) + ".zip");
    if (os.path.isfile(zip)):
        with open(zip,"rb") as f:
            return f.read();

    resp = requests.get(f"https://cla.higuy.me/api/v1/missions/{id}/zip?official=true");

    zf = ZipFile(io.BytesIO(resp.content),"r");

    zf_dest = ZipFile(zip,"w");

    for f in zf.namelist():
        ogname = f;
        if "interiors_mbg" in f:
            f = f.replace('interiors_mbg/','interiors/');

        fpath = os.path.join(main_path,'assets','data',*f.split('/'));
        if (os.path.isfile(fpath)):
            continue;

        zf_dest.writestr(f,zf.read(ogname));

    zf.close();
    zf_dest.close();

    with open(zip,"rb") as f:
        return f.read();

@app.route("/php/log_error.php", methods = [ "POST" ])
def log_error():

    postdata = request.get_json();
    
    if (not os.path.isdir(os.path.join(main_path,'storage','logs'))):
        os.mkdir(os.path.join(main_path,'storage','logs'));


    s = str(datetime.datetime.now()) + " | " + postdata.get('userAgent') + "\n";
    errs = json.loads(postdata.get('errors'));

    for kvp in errs:
        s += kvp["filename"] + ":" + kvp["line"] + ":" + kvp["column"] + " " + kvp["message"] + "\n";

    s += "\n";

    with open(os.path.join(main_path,'storage','logs','user_errors.log'),"a") as f:
        print(s,file = f);

@app.route("/leaderboards", methods = [ "GET", "POST" ])
def leaderboards():
    if (request.method == "GET"):
        mission = request.args.get('mission');
        count = request.args.get('count',100);
        data = get_scores(mission,count);
        return jsonify(data);
    
    if (request.method == "POST"):
        data = request.get_json();
        username = data["username"];
        score = data["score"];
        mission = data["mission"];

        save_score(mission,username,score);

        return "OK";


@app.route("/php/update_leaderboard.php", methods = [ "POST" ])
def update_leaderboard():
    data = request.json;
    userid = data["randomId"];
    version = data.get('version',0);
    times = data.get('bestTimes',{});

    lbs = None;
    with open(os.path.join(main_path,'php','leaderboard.json'),'r') as f:
        lbs = json.loads(f.read());

    for key in times:
        if key not in lbs:
            lbs[key] = [times[key]];
        else:
            hasValue = False
            lst = lbs[key];

            for i in range(len(lst)):
                score = lst[i];
                if score[0] == times[key][0]:
                    score = times[key]
                    lst[i] = score
                    hasValue = True;  

            if (not hasValue):
                lst.append(times[key]);
            lst = sorted(lst,key = lambda x: x[1]);
            lbs[key] = lst;

    with open(os.path.join(main_path,'php','leaderboard.json'),'w') as f:
        print(json.dumps(lbs),file = f);

    with open(os.path.join(main_path,'php','leaderboard.json'),'r') as f:
        return jsonify(json.loads(f.read()));

if (not os.path.isfile(os.path.join(main_path,"storage","leaderboards.db"))):
    setup_db();
