from flask import Flask, render_template, url_for, Response, jsonify, request ,redirect, send_file;
import os;
import requests;
from zipfile import ZipFile;
import io;
import json;
import datetime;
import sqlite3;
import base64;
import zlib;
import json;
#import sheetsupdater;

main_path = os.path.abspath(".");

USE_PROXY_ASSETS = True;

app = Flask(__name__,static_folder="",template_folder=main_path);

REWIND_ASSETS = [
    "ui/options/cntr_rwnd_d.png",
    "ui/options/cntr_rwnd_h.png",
    "ui/options/cntr_rwnd_n.png",
    "ui/options/rwnd_quality.png",
    "ui/options/rwnd_tab.png",
    "ui/options/rwnd_timescale.png",
    "ui/options/rwnd_txt.png",
    "img/rewind.png"
]

CONTENT_TYPE_DICT = {
    "jpg": "image/jpg",
    "png": "image/png",
    "mis": "application/octet-stream",
    "css": "text/css; charset=utf-8",
    "wav": "application/octet-stream",
    "ogg": "application/octet-stream"
}

def get_content_type(content):
    extension = content[-3:];
    if (extension in CONTENT_TYPE_DICT):
        return CONTENT_TYPE_DICT[extension];
    return "text/html; charset=utf-8";
    

@app.route('/')
def main():
    resp = send_file(os.path.join(main_path,"index.html"));
    resp.headers["Cache-Control"] = "no-store";
    return resp;

@app.route('/manifest.json')
def manifest():
    resp = send_file(os.path.join(main_path,"manifest.json"));
    resp.headers["Cache-Control"] = "public, max-age=14400";
    resp.headers["Content-Type"] = "application/json";
    return resp;

@app.route('/assets/<path:varargs>')
def assets(varargs):
    content_type = get_content_type(varargs);
    if (USE_PROXY_ASSETS):
        url = f"https://marbleblast.vani.ga/assets/{varargs}";
        if (varargs not in REWIND_ASSETS and "data/missions/custom" not in varargs):
            resp = redirect(url);
            resp.headers["Cache-Control"] = "public, max-age=14400";
            resp.headers["Content-Type"] = content_type;
            return resp;
    varargs = varargs.split('/');
    path = os.path.join(main_path,"assets",*varargs);
    resp = send_file(path);
    resp.headers["Cache-Control"] = "public, max-age=14400";
    resp.headers["Content-Type"] = get_content_type;
    return resp;

@app.route('/bundles/<path:varargs>')
def bundles(varargs):
    varargs = varargs.split('/');
    path = os.path.join(main_path,"bundles",*varargs);
    resp = send_file(path);
    resp.headers["Cache-Control"] = "no-store";
    if (".js" in path):
        resp.mimetype = "application/javascript";
    if (".css" in path):
        resp.mimetype = "text/css"; 
    return resp;           

@app.route('/css/<path:varargs>')
def css(varargs):
    varargs = varargs.split('/');
    path = os.path.join(main_path,"css",*varargs);
    resp = send_file(path);
    resp.mimetype = "text/css";
    return resp;

@app.route('/js/<path:varargs>')
def js(varargs):
    varargs = varargs.split('/');
    path = os.path.join(main_path,"js",*varargs);
    resp = send_file(path);
    resp.headers["Cache-Control"] = "no-store";
    resp.mimetype = "application/javascript";
    return resp;

@app.route('/lib/<path:varargs>')
def lib(varargs):
    varargs = varargs.split('/');
    path = os.path.join(main_path,"lib",*varargs);
    resp = send_file(path);
    resp.mimetype = "application/javascript";
    return resp;

def scan_directory(path):
    dirstruct = os.listdir(path);
    ret = {};

    for file in dirstruct:
        ret[file] = None;
        if (os.path.isdir(os.path.join(path,file))):
            ret[file] = scan_directory(os.path.join(path,file));

    return ret;

@app.route('/api/directory_structure')
def get_directory_structure():
    if (USE_PROXY_ASSETS):
        with open(os.path.join(main_path,"assets","directory_structure.json")) as f:
            j = json.loads(f.read());
            return jsonify(j);
    return jsonify(scan_directory(os.path.join(main_path,"assets","data")));

@app.route('/api/directory_structure_mbp')
def get_directory_structure_mbp():
    if (USE_PROXY_ASSETS):
        with open(os.path.join(main_path,"assets","directory_structure_mbp.json")) as f:
            j = json.loads(f.read());
            return jsonify(j);
    return jsonify(scan_directory(os.path.join(main_path,"assets","data_mbp")));

@app.route('/api/custom/<path>')
def get_custom_mission(path):
    if (USE_PROXY_ASSETS):
        return redirect(f"https://marbleblast.vani.ga/assets/{path}");
    return 404;

@app.route('/api/version_history')
def version_history():
    resp = send_file(os.path.join(main_path, "..", "version_history.md"))
    resp.headers["Cache-Control"] = "no-cache, no-store";
    resp.headers["Content-Type"] = 'text/markdown';
    return resp;

@app.route('/api/activity')
def register_activity():
    return 200;

@app.route("/api/error", methods = [ "POST" ])
def log_error():
    postdata = request.get_json();
    
    if (not os.path.isdir(os.path.join(main_path,'storage','logs'))):
        os.mkdir(os.path.join(main_path,'storage','logs'));


    s = str(datetime.datetime.now()) + " | " + postdata['userAgent'] + "\n";
    errs = postdata['errors'];

    for kvp in errs:
        s += kvp["filename"] + ":" + str(kvp["line"]) + ":" + str(kvp["column"]) + " " + kvp["message"] + "\n";

    s += "\n";

    with open(os.path.join(main_path,'storage','logs','user_errors.log'),"a") as f:
        print(s,file = f);

    return "OK";

@app.route("/api/scores", methods = [ "POST "])
def get_leaderboard():
    options = request.get_json();

    responsedict = {};

    for mission in options["missions"]:
        scoredata = get_scores(mission, 100)
        responsedict[mission] = scoredata;

    return jsonify(responsedict);

def setup_db():
    lb = sqlite3.connect(os.path.join(main_path,'storage','leaderboards.db'));
    cur = lb.cursor();
    cur.execute('''
    CREATE TABLE IF NOT EXISTS scores(
    mission varchar(256),
    score float,
    username varchar(256)
    );
    ''');
    cur.execute('''
    CREATE TABLE IF NOT EXISTS topreplays(
    mission varchar(256),
    score float,
    replay mediumblob
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
    inserted = False;
    lb = sqlite3.connect(os.path.join(main_path,'storage','leaderboards.db'));
    cur = lb.cursor();
    res = cur.execute("SELECT username,score FROM scores WHERE (mission=? AND username=?);",(mission,username)).fetchall();
    if (len(res) <= 0):
        cur.execute("INSERT INTO scores VALUES(?,?,?);",(mission,score,username));
        inserted = True
    else:
        lastscore = res[0][1];
        if (lastscore > score):
            cur.execute("UPDATE scores SET score=? WHERE (mission=? AND username=?);",(score,mission,username));
            inserted = True;
    lb.commit();
    cur.close();
    lb.close();
    return inserted

def upload_top_replay(mission,time,replaydata):
    lb = sqlite3.connect(os.path.join(main_path,'storage','leaderboards.db'));
    cur = lb.cursor();
    cur.execute("DELETE FROM topreplays WHERE mission=?",(mission,));
    cur.execute("INSERT INTO topreplays VALUES(?,?,?);",(mission,time,replaydata));
    lb.commit();
    cur.close();
    lb.close();

def get_top_replay(mission):
    lb = sqlite3.connect(os.path.join(main_path,'storage','leaderboards.db'));
    cur = lb.cursor();
    res = cur.execute("SELECT replay FROM topreplays WHERE mission=?",(mission,)).fetchall();
    if (len(res) > 0):
        cur.close();
        lb.close();
        return res[0];
    else:
        cur.close();
        lb.close();
        return None;

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

setup_db();

@app.route("/leaderboards/uploadreplay", methods = [ 'POST' ])
def upload_replay():

    if (request.headers['Content-Type'] == 'application/octet-stream'):
        replaydata = request.data;
        mission = request.args.get('mission');
        time = request.args.get('time');
        upload_top_replay(mission,time,replaydata);
        return "OK", 200;

    return "ERR", 400;

@app.route("/leaderboards/replay", methods = [ 'GET' ])
def get_replay():
    mission = request.args.get('mission');
    topreplay = get_top_replay(mission);
    if (topreplay == None):
        return abort(404);
    else:
        return Response(topreplay,headers={ "Content-Type": 'application/octet-stream' });


@app.route("/leaderboards/has_replay", methods = [ 'GET' ])
def has_replay():
    mission = request.args.get('mission');
    topreplay = get_top_replay(mission);
    if (topreplay == None):
        return "false";
    else:
        return "true";


# @app.route("/lbs/data")
# def get_lb_sheet():
#     return sheetsupdater.get_data();