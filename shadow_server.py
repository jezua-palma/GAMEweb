#!/usr/bin/env python3
"""Shadow Depths LAN server with SQLite social/multiplayer APIs.

Features:
- Static file hosting for the web game
- Account register/login with token sessions
- Friend requests + friendships
- Direct messages
- Party invites + party membership
- Live presence updates (online/in-game with stage info)
- Run stats + checkpoint storage
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import secrets
import sqlite3
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qs, urlparse


ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(ROOT_DIR, "shadow_depths.db")
PASSWORD_SALT = "shadow_depths_lan_v1"
TOKEN_BYTES = 24


db_lock = threading.Lock()
db_conn = sqlite3.connect(DB_PATH, check_same_thread=False)
db_conn.row_factory = sqlite3.Row


def now_ts() -> int:
    return int(time.time())


def hash_password(password: str) -> str:
    return hashlib.sha256((PASSWORD_SALT + password).encode("utf-8")).hexdigest()


def valid_username(username: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9_]{2,16}", username or ""))


def bool_int(value: Any) -> int:
    return 1 if bool(value) else 0


def normalize_pair(a: int, b: int) -> Tuple[int, int]:
    return (a, b) if a < b else (b, a)


def row_stats(row: sqlite3.Row) -> Dict[str, int]:
    return {
        "bestScore": int(row["best_score"] or 0),
        "bestFloor": int(row["best_floor"] or 0),
        "totalRuns": int(row["total_runs"] or 0),
        "totalKills": int(row["total_kills"] or 0),
        "totalGold": int(row["total_gold"] or 0),
    }


def init_db() -> None:
    with db_lock:
        cur = db_conn.cursor()
        cur.executescript(
            """
            PRAGMA journal_mode=WAL;
            PRAGMA foreign_keys=ON;

            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                last_seen INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'offline',
                best_score INTEGER NOT NULL DEFAULT 0,
                best_floor INTEGER NOT NULL DEFAULT 0,
                total_runs INTEGER NOT NULL DEFAULT 0,
                total_kills INTEGER NOT NULL DEFAULT 0,
                total_gold INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                last_seen INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

            CREATE TABLE IF NOT EXISTS runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                score INTEGER NOT NULL,
                floor INTEGER NOT NULL,
                kills INTEGER NOT NULL,
                gold INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_runs_user_created ON runs(user_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS checkpoints (
                user_id INTEGER PRIMARY KEY,
                data_json TEXT NOT NULL,
                saved_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS friendships (
                user_a INTEGER NOT NULL,
                user_b INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                PRIMARY KEY (user_a, user_b),
                FOREIGN KEY(user_a) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(user_b) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS friend_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                from_user INTEGER NOT NULL,
                to_user INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at INTEGER NOT NULL,
                responded_at INTEGER,
                FOREIGN KEY(from_user) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(to_user) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_friend_requests_to_status ON friend_requests(to_user, status);
            CREATE INDEX IF NOT EXISTS idx_friend_requests_from_status ON friend_requests(from_user, status);

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                from_user INTEGER NOT NULL,
                to_user INTEGER NOT NULL,
                body TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                read_at INTEGER,
                FOREIGN KEY(from_user) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(to_user) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(from_user, to_user, id);
            CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_user, id);

            CREATE TABLE IF NOT EXISTS parties (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                leader_id INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(leader_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS party_members (
                party_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                joined_at INTEGER NOT NULL,
                PRIMARY KEY (party_id, user_id),
                FOREIGN KEY(party_id) REFERENCES parties(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_party_members_user ON party_members(user_id, status);

            CREATE TABLE IF NOT EXISTS party_invites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                party_id INTEGER NOT NULL,
                from_user INTEGER NOT NULL,
                to_user INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at INTEGER NOT NULL,
                responded_at INTEGER,
                FOREIGN KEY(party_id) REFERENCES parties(id) ON DELETE CASCADE,
                FOREIGN KEY(from_user) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(to_user) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_party_invites_to_status ON party_invites(to_user, status);

            CREATE TABLE IF NOT EXISTS presence (
                user_id INTEGER PRIMARY KEY,
                status TEXT NOT NULL DEFAULT 'online',
                in_game INTEGER NOT NULL DEFAULT 0,
                level INTEGER NOT NULL DEFAULT 0,
                stage INTEGER NOT NULL DEFAULT 0,
                floor INTEGER NOT NULL DEFAULT 0,
                pos_x REAL NOT NULL DEFAULT 0,
                pos_y REAL NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS coop_stage_state (
                party_id INTEGER NOT NULL,
                stage_key TEXT NOT NULL,
                state_json TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1,
                host_user_id INTEGER,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (party_id, stage_key),
                FOREIGN KEY(party_id) REFERENCES parties(id) ON DELETE CASCADE,
                FOREIGN KEY(host_user_id) REFERENCES users(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS idx_coop_stage_party_updated ON coop_stage_state(party_id, updated_at DESC);

            CREATE TABLE IF NOT EXISTS coop_loot_claims (
                party_id INTEGER NOT NULL,
                stage_key TEXT NOT NULL,
                loot_key TEXT NOT NULL,
                owner_user_id INTEGER NOT NULL,
                claimed_at INTEGER NOT NULL,
                PRIMARY KEY (party_id, stage_key, loot_key),
                FOREIGN KEY(party_id) REFERENCES parties(id) ON DELETE CASCADE,
                FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_coop_loot_owner ON coop_loot_claims(owner_user_id, claimed_at DESC);
            """
        )
        db_conn.commit()


def db_one(query: str, params: Tuple[Any, ...] = ()) -> Optional[sqlite3.Row]:
    cur = db_conn.execute(query, params)
    return cur.fetchone()


def db_all(query: str, params: Tuple[Any, ...] = ()) -> List[sqlite3.Row]:
    cur = db_conn.execute(query, params)
    return cur.fetchall()


def user_summary(user_row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "username": user_row["username"],
        "status": user_row["status"],
        "lastSeen": int(user_row["last_seen"] or 0),
        "stats": row_stats(user_row),
    }


def get_user_by_username(username: str) -> Optional[sqlite3.Row]:
    return db_one("SELECT * FROM users WHERE lower(username)=lower(?)", (username,))


def get_user_party_id(user_id: int) -> Optional[int]:
    row = db_one(
        "SELECT party_id FROM party_members WHERE user_id=? AND status='active' LIMIT 1",
        (user_id,),
    )
    return int(row["party_id"]) if row else None


def get_party_info(party_id: int) -> Optional[Dict[str, Any]]:
    party = db_one(
        """
        SELECT p.id, p.leader_id, p.created_at, p.updated_at, u.username AS leader_name
        FROM parties p
        JOIN users u ON u.id = p.leader_id
        WHERE p.id=?
        """,
        (party_id,),
    )
    if not party:
        return None

    members = db_all(
        """
        SELECT u.id, u.username, u.status,
               pr.in_game, pr.level, pr.stage, pr.floor, pr.updated_at
        FROM party_members pm
        JOIN users u ON u.id = pm.user_id
        LEFT JOIN presence pr ON pr.user_id = u.id
        WHERE pm.party_id=? AND pm.status='active'
        ORDER BY lower(u.username)
        """,
        (party_id,),
    )

    return {
        "id": int(party["id"]),
        "leader": party["leader_name"],
        "createdAt": int(party["created_at"] or 0),
        "updatedAt": int(party["updated_at"] or 0),
        "members": [
            {
                "username": row["username"],
                "status": row["status"],
                "inGame": bool(row["in_game"] or 0),
                "level": int(row["level"] or 0),
                "stage": int(row["stage"] or 0),
                "floor": int(row["floor"] or 0),
                "presenceUpdatedAt": int(row["updated_at"] or 0),
            }
            for row in members
        ],
    }


def get_party_live_snapshot(
    party_id: int,
    level: Optional[int] = None,
    stage: Optional[int] = None,
    floor: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    party = db_one(
        """
        SELECT p.id, p.leader_id, p.created_at, p.updated_at, u.username AS leader_name
        FROM parties p
        JOIN users u ON u.id = p.leader_id
        WHERE p.id=?
        """,
        (party_id,),
    )
    if not party:
        return None

    rows = db_all(
        """
        SELECT u.id AS user_id, u.username, u.status,
               pr.in_game, pr.level, pr.stage, pr.floor, pr.pos_x, pr.pos_y, pr.updated_at
        FROM party_members pm
        JOIN users u ON u.id = pm.user_id
        LEFT JOIN presence pr ON pr.user_id = u.id
        WHERE pm.party_id=? AND pm.status='active'
        ORDER BY pm.joined_at ASC, lower(u.username) ASC
        """,
        (party_id,),
    )

    members: List[Dict[str, Any]] = []
    for row in rows:
        member_level = int(row["level"] or 0)
        member_stage = int(row["stage"] or 0)
        member_floor = int(row["floor"] or 0)
        same_layer = True
        if level is not None and member_level != level:
            same_layer = False
        if stage is not None and member_stage != stage:
            same_layer = False
        if floor is not None and member_floor != floor:
            same_layer = False

        members.append(
            {
                "userId": int(row["user_id"]),
                "username": row["username"],
                "status": row["status"],
                "inGame": bool(row["in_game"] or 0),
                "level": member_level,
                "stage": member_stage,
                "floor": member_floor,
                "x": float(row["pos_x"] or 0.0),
                "y": float(row["pos_y"] or 0.0),
                "presenceUpdatedAt": int(row["updated_at"] or 0),
                "sameLayer": same_layer,
            }
        )

    return {
        "partyId": int(party["id"]),
        "leader": party["leader_name"],
        "createdAt": int(party["created_at"] or 0),
        "updatedAt": int(party["updated_at"] or 0),
        "serverTime": now_ts(),
        "members": members,
    }


def get_friend_ids(user_id: int) -> List[int]:
    rows = db_all(
        """
        SELECT CASE WHEN user_a=? THEN user_b ELSE user_a END AS friend_id
        FROM friendships
        WHERE user_a=? OR user_b=?
        """,
        (user_id, user_id, user_id),
    )
    return [int(r["friend_id"]) for r in rows]


def stage_triplet_to_key(level: int, stage: int, floor: int) -> str:
    return f"{level}:{stage}:{floor}"


def parse_stage_triplet(
    level_raw: Any,
    stage_raw: Any,
    floor_raw: Any,
) -> Optional[Tuple[int, int, int, str]]:
    try:
        level = int(level_raw)
        stage = int(stage_raw)
        floor = int(floor_raw)
    except Exception:
        return None
    if level <= 0 or stage <= 0 or floor <= 0:
        return None
    if level > 999 or stage > 999 or floor > 99999:
        return None
    return level, stage, floor, stage_triplet_to_key(level, stage, floor)


def normalize_enemy_state(raw: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None
    enemy_id = str(raw.get("id") or "").strip()
    if not enemy_id or len(enemy_id) > 96:
        return None
    try:
        hp = int(raw.get("hp") or 0)
    except Exception:
        hp = 0
    try:
        max_hp = int(raw.get("maxHp") or hp or 1)
    except Exception:
        max_hp = max(hp, 1)
    if max_hp <= 0:
        max_hp = 1
    hp = max(0, min(hp, max_hp))
    alive = bool(raw.get("alive", hp > 0)) and hp > 0
    try:
        x = float(raw.get("x") or 0.0)
    except Exception:
        x = 0.0
    try:
        y = float(raw.get("y") or 0.0)
    except Exception:
        y = 0.0
    if not (-1_000_000 <= x <= 1_000_000):
        x = 0.0
    if not (-1_000_000 <= y <= 1_000_000):
        y = 0.0
    kind = str(raw.get("kind") or "").strip().lower()
    if len(kind) > 32:
        kind = kind[:32]
    return {
        "id": enemy_id,
        "hp": hp,
        "maxHp": max_hp,
        "alive": alive,
        "x": x,
        "y": y,
        "isElite": bool(raw.get("isElite", False)),
        "kind": kind or "enemy",
    }


def normalize_coop_state_payload(raw_state: Any) -> Dict[str, Any]:
    enemies: List[Dict[str, Any]] = []
    if isinstance(raw_state, dict):
        raw_enemies = raw_state.get("enemies")
        if isinstance(raw_enemies, list):
            for raw_enemy in raw_enemies:
                enemy = normalize_enemy_state(raw_enemy)
                if enemy:
                    enemies.append(enemy)
                if len(enemies) >= 1024:
                    break
    # Keep a deterministic order for easier client reconciliation.
    enemies.sort(key=lambda e: e["id"])
    return {"enemies": enemies}


def merge_coop_state(existing: Optional[Dict[str, Any]], incoming: Dict[str, Any]) -> Dict[str, Any]:
    incoming_enemies = incoming.get("enemies", [])
    existing_enemies = []
    if isinstance(existing, dict):
        existing_enemies = existing.get("enemies", []) if isinstance(existing.get("enemies", []), list) else []

    existing_map: Dict[str, Dict[str, Any]] = {}
    for row in existing_enemies:
        parsed = normalize_enemy_state(row)
        if parsed:
            existing_map[parsed["id"]] = parsed

    merged: List[Dict[str, Any]] = []
    seen_ids: set[str] = set()
    for incoming_enemy in incoming_enemies:
        current = normalize_enemy_state(incoming_enemy)
        if not current:
            continue
        eid = current["id"]
        seen_ids.add(eid)
        prev = existing_map.get(eid)
        if prev:
            hp = min(int(prev["hp"]), int(current["hp"]))
            max_hp = max(int(prev["maxHp"]), int(current["maxHp"]))
            hp = max(0, min(hp, max_hp))
            alive = bool(prev["alive"]) and bool(current["alive"]) and hp > 0
            merged.append(
                {
                    "id": eid,
                    "hp": hp,
                    "maxHp": max_hp,
                    "alive": alive,
                    "x": float(current["x"]),
                    "y": float(current["y"]),
                    "isElite": bool(current.get("isElite", False) or prev.get("isElite", False)),
                    "kind": str(current.get("kind") or prev.get("kind") or "enemy"),
                }
            )
        else:
            merged.append(current)

    # Preserve known enemies missing from an incoming payload (prevents accidental drops).
    for eid, prev in existing_map.items():
        if eid not in seen_ids:
            merged.append(prev)

    merged.sort(key=lambda e: e["id"])
    return {"enemies": merged}


def are_friends(user_a: int, user_b: int) -> bool:
    a, b = normalize_pair(user_a, user_b)
    row = db_one("SELECT 1 FROM friendships WHERE user_a=? AND user_b=? LIMIT 1", (a, b))
    return row is not None


def cleanup_party_if_empty(party_id: int) -> None:
    count_row = db_one(
        "SELECT count(*) AS c FROM party_members WHERE party_id=? AND status='active'",
        (party_id,),
    )
    count = int(count_row["c"] or 0) if count_row else 0
    if count <= 0:
        db_conn.execute("DELETE FROM parties WHERE id=?", (party_id,))
        db_conn.execute("DELETE FROM party_invites WHERE party_id=?", (party_id,))
        return

    leader_row = db_one("SELECT leader_id FROM parties WHERE id=?", (party_id,))
    if not leader_row:
        return
    leader_id = int(leader_row["leader_id"])
    leader_member = db_one(
        "SELECT 1 FROM party_members WHERE party_id=? AND user_id=? AND status='active'",
        (party_id, leader_id),
    )
    if leader_member:
        return
    next_row = db_one(
        """
        SELECT user_id FROM party_members
        WHERE party_id=? AND status='active'
        ORDER BY joined_at ASC
        LIMIT 1
        """,
        (party_id,),
    )
    if next_row:
        db_conn.execute(
            "UPDATE parties SET leader_id=?, updated_at=? WHERE id=?",
            (int(next_row["user_id"]), now_ts(), party_id),
        )


class ShadowHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        # Keep console readable.
        return

    # ===== HTTP utilities =====
    def send_json(self, status: int, payload: Dict[str, Any]) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def parse_json_body(self) -> Dict[str, Any]:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return {}
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            parsed = json.loads(raw.decode("utf-8"))
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}

    def parse_auth_token(self) -> str:
        auth = self.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            return auth[7:].strip()
        return ""

    def auth_user(self) -> Optional[sqlite3.Row]:
        token = self.parse_auth_token()
        if not token:
            return None
        with db_lock:
            row = db_one(
                """
                SELECT u.*
                FROM sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token=?
                LIMIT 1
                """,
                (token,),
            )
            if not row:
                return None
            ts = now_ts()
            db_conn.execute("UPDATE sessions SET last_seen=? WHERE token=?", (ts, token))
            db_conn.execute("UPDATE users SET last_seen=?, status='online' WHERE id=?", (ts, int(row["id"])))
            db_conn.commit()
            return db_one("SELECT * FROM users WHERE id=?", (int(row["id"]),))

    def require_auth(self) -> Optional[sqlite3.Row]:
        user = self.auth_user()
        if not user:
            self.send_json(401, {"success": False, "error": "Authentication required"})
            return None
        return user

    # ===== HTTP methods =====
    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api_get(parsed)
            return
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api_post(parsed)
            return
        self.send_json(404, {"success": False, "error": "Not found"})

    # ===== API GET routes =====
    def handle_api_get(self, parsed) -> None:
        path = parsed.path
        params = parse_qs(parsed.query)

        if path == "/api/health":
            self.send_json(200, {"success": True, "service": "shadow-server", "time": now_ts()})
            return

        if path == "/api/leaderboard":
            with db_lock:
                rows = db_all(
                    """
                    SELECT username, best_score, best_floor, total_runs, total_kills, total_gold
                    FROM users
                    WHERE total_runs > 0
                    ORDER BY best_score DESC, best_floor DESC, total_kills DESC
                    LIMIT 50
                    """
                )
            self.send_json(
                200,
                {
                    "success": True,
                    "entries": [
                        {
                            "username": r["username"],
                            "score": int(r["best_score"] or 0),
                            "floors": int(r["best_floor"] or 0),
                            "runs": int(r["total_runs"] or 0),
                            "kills": int(r["total_kills"] or 0),
                            "gold": int(r["total_gold"] or 0),
                        }
                        for r in rows
                    ],
                },
            )
            return

        if path == "/api/social/me":
            user = self.require_auth()
            if not user:
                return
            self.send_json(200, {"success": True, "user": user_summary(user)})
            return

        if path == "/api/checkpoint/get":
            user = self.require_auth()
            if not user:
                return
            with db_lock:
                row = db_one("SELECT data_json, saved_at FROM checkpoints WHERE user_id=?", (int(user["id"]),))
            if not row:
                self.send_json(200, {"success": True, "checkpoint": None})
                return
            try:
                data = json.loads(row["data_json"])
            except Exception:
                data = None
            self.send_json(
                200,
                {
                    "success": True,
                    "checkpoint": data,
                    "savedAt": int(row["saved_at"] or 0),
                },
            )
            return

        if path == "/api/social/friends":
            user = self.require_auth()
            if not user:
                return
            user_id = int(user["id"])
            with db_lock:
                rows = db_all(
                    """
                    SELECT u.id, u.username, u.status, u.last_seen,
                           u.best_score, u.best_floor, u.total_runs, u.total_kills, u.total_gold,
                           p.in_game, p.level, p.stage, p.floor, p.updated_at
                    FROM friendships f
                    JOIN users u ON u.id = CASE WHEN f.user_a=? THEN f.user_b ELSE f.user_a END
                    LEFT JOIN presence p ON p.user_id = u.id
                    WHERE f.user_a=? OR f.user_b=?
                    ORDER BY lower(u.username)
                    """,
                    (user_id, user_id, user_id),
                )
            self.send_json(
                200,
                {
                    "success": True,
                    "friends": [
                        {
                            "username": r["username"],
                            "status": r["status"],
                            "lastSeen": int(r["last_seen"] or 0),
                            "inGame": bool(r["in_game"] or 0),
                            "level": int(r["level"] or 0),
                            "stage": int(r["stage"] or 0),
                            "floor": int(r["floor"] or 0),
                            "presenceUpdatedAt": int(r["updated_at"] or 0),
                            "stats": {
                                "bestScore": int(r["best_score"] or 0),
                                "bestFloor": int(r["best_floor"] or 0),
                                "totalRuns": int(r["total_runs"] or 0),
                                "totalKills": int(r["total_kills"] or 0),
                                "totalGold": int(r["total_gold"] or 0),
                            },
                        }
                        for r in rows
                    ],
                },
            )
            return

        if path == "/api/social/requests":
            user = self.require_auth()
            if not user:
                return
            user_id = int(user["id"])
            with db_lock:
                incoming = db_all(
                    """
                    SELECT fr.id, fr.created_at, u.username AS from_username
                    FROM friend_requests fr
                    JOIN users u ON u.id = fr.from_user
                    WHERE fr.to_user=? AND fr.status='pending'
                    ORDER BY fr.created_at DESC
                    """,
                    (user_id,),
                )
                outgoing = db_all(
                    """
                    SELECT fr.id, fr.created_at, u.username AS to_username
                    FROM friend_requests fr
                    JOIN users u ON u.id = fr.to_user
                    WHERE fr.from_user=? AND fr.status='pending'
                    ORDER BY fr.created_at DESC
                    """,
                    (user_id,),
                )
            self.send_json(
                200,
                {
                    "success": True,
                    "incoming": [
                        {
                            "id": int(r["id"]),
                            "from": r["from_username"],
                            "createdAt": int(r["created_at"] or 0),
                        }
                        for r in incoming
                    ],
                    "outgoing": [
                        {
                            "id": int(r["id"]),
                            "to": r["to_username"],
                            "createdAt": int(r["created_at"] or 0),
                        }
                        for r in outgoing
                    ],
                },
            )
            return

        if path == "/api/social/messages":
            user = self.require_auth()
            if not user:
                return
            user_id = int(user["id"])
            target_name = (params.get("with", [""])[0] or "").strip()
            if not target_name:
                self.send_json(400, {"success": False, "error": "Missing chat target"})
                return
            with db_lock:
                target = get_user_by_username(target_name)
                if not target:
                    self.send_json(404, {"success": False, "error": "Friend not found"})
                    return
                target_id = int(target["id"])
                if not are_friends(user_id, target_id):
                    self.send_json(403, {"success": False, "error": "You can only chat with friends"})
                    return

                since_id = 0
                try:
                    since_id = max(0, int(params.get("sinceId", ["0"])[0]))
                except Exception:
                    since_id = 0
                limit = 80
                try:
                    limit = min(200, max(1, int(params.get("limit", ["80"])[0])))
                except Exception:
                    limit = 80

                rows = db_all(
                    """
                    SELECT m.id, m.from_user, m.to_user, m.body, m.created_at,
                           uf.username AS from_name, ut.username AS to_name
                    FROM messages m
                    JOIN users uf ON uf.id = m.from_user
                    JOIN users ut ON ut.id = m.to_user
                    WHERE ((m.from_user=? AND m.to_user=?) OR (m.from_user=? AND m.to_user=?))
                      AND m.id > ?
                    ORDER BY m.id ASC
                    LIMIT ?
                    """,
                    (user_id, target_id, target_id, user_id, since_id, limit),
                )

                db_conn.execute(
                    """
                    UPDATE messages
                    SET read_at=?
                    WHERE from_user=? AND to_user=? AND read_at IS NULL
                    """,
                    (now_ts(), target_id, user_id),
                )
                db_conn.commit()

            self.send_json(
                200,
                {
                    "success": True,
                    "messages": [
                        {
                            "id": int(r["id"]),
                            "from": r["from_name"],
                            "to": r["to_name"],
                            "body": r["body"],
                            "createdAt": int(r["created_at"] or 0),
                        }
                        for r in rows
                    ],
                },
            )
            return

        if path == "/api/social/party":
            user = self.require_auth()
            if not user:
                return
            user_id = int(user["id"])
            with db_lock:
                party_id = get_user_party_id(user_id)
                info = get_party_info(party_id) if party_id else None
            self.send_json(200, {"success": True, "party": info})
            return

        if path == "/api/social/party/invites":
            user = self.require_auth()
            if not user:
                return
            user_id = int(user["id"])
            with db_lock:
                rows = db_all(
                    """
                    SELECT pi.id, pi.party_id, pi.created_at, u.username AS from_username
                    FROM party_invites pi
                    JOIN users u ON u.id = pi.from_user
                    WHERE pi.to_user=? AND pi.status='pending'
                    ORDER BY pi.created_at DESC
                    """,
                    (user_id,),
                )
            self.send_json(
                200,
                {
                    "success": True,
                    "invites": [
                        {
                            "id": int(r["id"]),
                            "partyId": int(r["party_id"]),
                            "from": r["from_username"],
                            "createdAt": int(r["created_at"] or 0),
                        }
                        for r in rows
                    ],
                },
            )
            return

        if path == "/api/social/party/live":
            user = self.require_auth()
            if not user:
                return
            user_id = int(user["id"])

            include_self = (params.get("includeSelf", ["0"])[0] or "0").strip() in ("1", "true", "yes")

            def parse_optional_int(name: str) -> Optional[int]:
                raw = (params.get(name, [""])[0] or "").strip()
                if not raw:
                    return None
                try:
                    return int(raw)
                except Exception:
                    return None

            level = parse_optional_int("level")
            stage = parse_optional_int("stage")
            floor = parse_optional_int("floor")

            with db_lock:
                party_id = get_user_party_id(user_id)
                if not party_id:
                    self.send_json(
                        200,
                        {
                            "success": True,
                            "partyId": None,
                            "leader": None,
                            "members": [],
                            "serverTime": now_ts(),
                        },
                    )
                    return

                snapshot = get_party_live_snapshot(party_id, level=level, stage=stage, floor=floor)
                if not snapshot:
                    self.send_json(
                        200,
                        {
                            "success": True,
                            "partyId": None,
                            "leader": None,
                            "members": [],
                            "serverTime": now_ts(),
                        },
                    )
                    return

            if not include_self:
                snapshot["members"] = [
                    m for m in snapshot["members"] if int(m.get("userId") or 0) != user_id
                ]
            self.send_json(200, {"success": True, **snapshot})
            return

        if path == "/api/coop/state":
            user = self.require_auth()
            if not user:
                return
            user_id = int(user["id"])

            parsed = parse_stage_triplet(
                params.get("level", [""])[0],
                params.get("stage", [""])[0],
                params.get("floor", [""])[0],
            )
            if not parsed:
                self.send_json(400, {"success": False, "error": "Invalid level/stage/floor"})
                return
            level, stage, floor, stage_key = parsed

            with db_lock:
                party_id = get_user_party_id(user_id)
                if not party_id:
                    self.send_json(403, {"success": False, "error": "Join a party to use co-op sync"})
                    return
                party = db_one(
                    """
                    SELECT p.id, p.leader_id, u.username AS leader_name
                    FROM parties p
                    JOIN users u ON u.id = p.leader_id
                    WHERE p.id=?
                    LIMIT 1
                    """,
                    (party_id,),
                )
                row = db_one(
                    """
                    SELECT state_json, version, updated_at
                    FROM coop_stage_state
                    WHERE party_id=? AND stage_key=?
                    LIMIT 1
                    """,
                    (party_id, stage_key),
                )

            if not row:
                self.send_json(
                    200,
                    {
                        "success": True,
                        "partyId": party_id,
                        "leader": party["leader_name"] if party else None,
                        "stage": {"level": level, "stage": stage, "floor": floor},
                        "version": 0,
                        "updatedAt": 0,
                        "state": None,
                    },
                )
                return

            try:
                parsed_state = json.loads(row["state_json"])
            except Exception:
                parsed_state = {"enemies": []}
            normalized_state = normalize_coop_state_payload(parsed_state)
            self.send_json(
                200,
                {
                    "success": True,
                    "partyId": party_id,
                    "leader": party["leader_name"] if party else None,
                    "stage": {"level": level, "stage": stage, "floor": floor},
                    "version": int(row["version"] or 0),
                    "updatedAt": int(row["updated_at"] or 0),
                    "state": normalized_state,
                },
            )
            return

        if path == "/api/social/bootstrap":
            user = self.require_auth()
            if not user:
                return
            # Lightweight bootstrap: caller fetches detailed lists as needed.
            self.send_json(200, {"success": True, "user": user_summary(user)})
            return

        self.send_json(404, {"success": False, "error": "Unknown API route"})

    # ===== API POST routes =====
    def handle_api_post(self, parsed) -> None:
        path = parsed.path
        body = self.parse_json_body()

        if path == "/api/register":
            username = (body.get("username") or "").strip()
            password = body.get("password") or ""

            if not valid_username(username):
                self.send_json(400, {"success": False, "error": "Username must be 2-16 letters/numbers/_"})
                return
            if len(password) < 4:
                self.send_json(400, {"success": False, "error": "Password must be at least 4 characters"})
                return

            ts = now_ts()
            with db_lock:
                existing = get_user_by_username(username)
                if existing:
                    self.send_json(409, {"success": False, "error": "Username already taken"})
                    return
                db_conn.execute(
                    """
                    INSERT INTO users(username, password_hash, created_at, last_seen, status)
                    VALUES(?,?,?,?, 'online')
                    """,
                    (username, hash_password(password), ts, ts),
                )
                user = get_user_by_username(username)
                if not user:
                    db_conn.rollback()
                    self.send_json(500, {"success": False, "error": "Failed to create account"})
                    return
                user_id = int(user["id"])
                db_conn.execute(
                    """
                    INSERT INTO presence(user_id, status, in_game, level, stage, floor, pos_x, pos_y, updated_at)
                    VALUES(?, 'online', 0, 0, 0, 0, 0, 0, ?)
                    ON CONFLICT(user_id) DO UPDATE SET status='online', in_game=0, updated_at=excluded.updated_at
                    """,
                    (user_id, ts),
                )
                db_conn.commit()

            self.send_json(200, {"success": True})
            return

        if path == "/api/login":
            username = (body.get("username") or "").strip()
            password = body.get("password") or ""
            if not username or not password:
                self.send_json(400, {"success": False, "error": "Missing credentials"})
                return

            with db_lock:
                user = get_user_by_username(username)
                if not user:
                    self.send_json(404, {"success": False, "error": "Account not found"})
                    return
                if user["password_hash"] != hash_password(password):
                    self.send_json(401, {"success": False, "error": "Incorrect password"})
                    return

                ts = now_ts()
                token = secrets.token_urlsafe(TOKEN_BYTES)
                db_conn.execute(
                    "INSERT INTO sessions(token, user_id, created_at, last_seen) VALUES(?,?,?,?)",
                    (token, int(user["id"]), ts, ts),
                )
                db_conn.execute(
                    "UPDATE users SET last_seen=?, status='online' WHERE id=?",
                    (ts, int(user["id"])),
                )
                db_conn.execute(
                    """
                    INSERT INTO presence(user_id, status, in_game, level, stage, floor, pos_x, pos_y, updated_at)
                    VALUES(?, 'online', 0, 0, 0, 0, 0, 0, ?)
                    ON CONFLICT(user_id) DO UPDATE SET status='online', updated_at=excluded.updated_at
                    """,
                    (int(user["id"]), ts),
                )
                db_conn.commit()
                user = db_one("SELECT * FROM users WHERE id=?", (int(user["id"]),))

            self.send_json(
                200,
                {
                    "success": True,
                    "token": token,
                    "user": user_summary(user) if user else {"username": username},
                },
            )
            return

        if path == "/api/logout":
            token = self.parse_auth_token()
            if not token:
                self.send_json(200, {"success": True})
                return
            with db_lock:
                row = db_one("SELECT user_id FROM sessions WHERE token=?", (token,))
                db_conn.execute("DELETE FROM sessions WHERE token=?", (token,))
                if row:
                    user_id = int(row["user_id"])
                    ts = now_ts()
                    db_conn.execute("UPDATE users SET status='offline', last_seen=? WHERE id=?", (ts, user_id))
                    db_conn.execute(
                        """
                        INSERT INTO presence(user_id, status, in_game, level, stage, floor, pos_x, pos_y, updated_at)
                        VALUES(?, 'offline', 0, 0, 0, 0, 0, 0, ?)
                        ON CONFLICT(user_id) DO UPDATE SET status='offline', in_game=0, updated_at=excluded.updated_at
                        """,
                        (user_id, ts),
                    )
                db_conn.commit()
            self.send_json(200, {"success": True})
            return

        if path == "/api/stats/run":
            user = self.require_auth()
            if not user:
                return
            score = int(body.get("score") or 0)
            floor = int(body.get("floor") or 0)
            kills = int(body.get("kills") or 0)
            gold = int(body.get("gold") or 0)
            user_id = int(user["id"])
            ts = now_ts()

            with db_lock:
                db_conn.execute(
                    """
                    UPDATE users
                    SET total_runs = total_runs + 1,
                        total_kills = total_kills + ?,
                        total_gold = total_gold + ?,
                        best_score = CASE WHEN ? > best_score THEN ? ELSE best_score END,
                        best_floor = CASE WHEN ? > best_floor THEN ? ELSE best_floor END,
                        last_seen = ?
                    WHERE id=?
                    """,
                    (kills, gold, score, score, floor, floor, ts, user_id),
                )
                db_conn.execute(
                    """
                    INSERT INTO runs(user_id, score, floor, kills, gold, created_at)
                    VALUES(?,?,?,?,?,?)
                    """,
                    (user_id, score, floor, kills, gold, ts),
                )
                db_conn.commit()
            self.send_json(200, {"success": True})
            return

        if path == "/api/checkpoint/save":
            user = self.require_auth()
            if not user:
                return
            checkpoint = body.get("checkpoint")
            if checkpoint is None:
                self.send_json(400, {"success": False, "error": "Missing checkpoint data"})
                return
            try:
                serialized = json.dumps(checkpoint, separators=(",", ":"))
            except Exception:
                self.send_json(400, {"success": False, "error": "Checkpoint is not serializable"})
                return
            ts = now_ts()
            with db_lock:
                db_conn.execute(
                    """
                    INSERT INTO checkpoints(user_id, data_json, saved_at)
                    VALUES(?,?,?)
                    ON CONFLICT(user_id) DO UPDATE SET
                        data_json=excluded.data_json,
                        saved_at=excluded.saved_at
                    """,
                    (int(user["id"]), serialized, ts),
                )
                db_conn.commit()
            self.send_json(200, {"success": True, "savedAt": ts})
            return

        if path == "/api/checkpoint/clear":
            user = self.require_auth()
            if not user:
                return
            with db_lock:
                db_conn.execute("DELETE FROM checkpoints WHERE user_id=?", (int(user["id"]),))
                db_conn.commit()
            self.send_json(200, {"success": True})
            return

        if path == "/api/coop/state/push":
            user = self.require_auth()
            if not user:
                return
            user_id = int(user["id"])

            parsed = parse_stage_triplet(body.get("level"), body.get("stage"), body.get("floor"))
            if not parsed:
                self.send_json(400, {"success": False, "error": "Invalid level/stage/floor"})
                return
            level, stage, floor, stage_key = parsed
            incoming_state = normalize_coop_state_payload(body.get("state"))
            ts = now_ts()

            with db_lock:
                party_id = get_user_party_id(user_id)
                if not party_id:
                    self.send_json(403, {"success": False, "error": "Join a party to use co-op sync"})
                    return
                party = db_one("SELECT leader_id FROM parties WHERE id=? LIMIT 1", (party_id,))
                if not party:
                    self.send_json(410, {"success": False, "error": "Party no longer exists"})
                    return
                if int(party["leader_id"]) != user_id:
                    self.send_json(403, {"success": False, "error": "Only party leader can push co-op state"})
                    return

                row = db_one(
                    """
                    SELECT state_json, version
                    FROM coop_stage_state
                    WHERE party_id=? AND stage_key=?
                    LIMIT 1
                    """,
                    (party_id, stage_key),
                )
                existing_state: Optional[Dict[str, Any]] = None
                prev_version = 0
                if row:
                    prev_version = int(row["version"] or 0)
                    try:
                        existing_state = json.loads(row["state_json"])
                    except Exception:
                        existing_state = None

                merged_state = merge_coop_state(existing_state, incoming_state)
                new_version = prev_version + 1
                serialized = json.dumps(merged_state, separators=(",", ":"))

                db_conn.execute(
                    """
                    INSERT INTO coop_stage_state(party_id, stage_key, state_json, version, host_user_id, updated_at)
                    VALUES(?,?,?,?,?,?)
                    ON CONFLICT(party_id, stage_key) DO UPDATE SET
                        state_json=excluded.state_json,
                        version=excluded.version,
                        host_user_id=excluded.host_user_id,
                        updated_at=excluded.updated_at
                    """,
                    (party_id, stage_key, serialized, new_version, user_id, ts),
                )
                db_conn.commit()

            self.send_json(
                200,
                {
                    "success": True,
                    "partyId": party_id,
                    "stage": {"level": level, "stage": stage, "floor": floor},
                    "version": new_version,
                    "updatedAt": ts,
                    "state": merged_state,
                },
            )
            return

        if path == "/api/coop/hit":
            user = self.require_auth()
            if not user:
                return
            user_id = int(user["id"])

            parsed = parse_stage_triplet(body.get("level"), body.get("stage"), body.get("floor"))
            if not parsed:
                self.send_json(400, {"success": False, "error": "Invalid level/stage/floor"})
                return
            level, stage, floor, stage_key = parsed

            enemy_id = str(body.get("enemyId") or "").strip()
            if not enemy_id or len(enemy_id) > 96:
                self.send_json(400, {"success": False, "error": "Invalid enemy id"})
                return
            try:
                damage = int(body.get("damage") or 0)
            except Exception:
                damage = 0
            damage = max(1, min(999, damage))
            ts = now_ts()

            with db_lock:
                party_id = get_user_party_id(user_id)
                if not party_id:
                    self.send_json(403, {"success": False, "error": "Join a party to use co-op sync"})
                    return

                row = db_one(
                    """
                    SELECT state_json, version
                    FROM coop_stage_state
                    WHERE party_id=? AND stage_key=?
                    LIMIT 1
                    """,
                    (party_id, stage_key),
                )
                if not row:
                    self.send_json(404, {"success": False, "error": "Co-op stage state not initialized"})
                    return

                try:
                    parsed_state = json.loads(row["state_json"])
                except Exception:
                    parsed_state = {"enemies": []}
                state = normalize_coop_state_payload(parsed_state)

                target_enemy: Optional[Dict[str, Any]] = None
                for enemy in state["enemies"]:
                    if str(enemy.get("id")) == enemy_id:
                        target_enemy = enemy
                        break

                if not target_enemy:
                    self.send_json(404, {"success": False, "error": "Enemy not found in stage state"})
                    return

                hp_now = int(target_enemy.get("hp") or 0)
                if hp_now > 0 and bool(target_enemy.get("alive", True)):
                    hp_now = max(0, hp_now - damage)
                    target_enemy["hp"] = hp_now
                    target_enemy["alive"] = hp_now > 0
                else:
                    target_enemy["hp"] = 0
                    target_enemy["alive"] = False

                version = int(row["version"] or 0) + 1
                serialized = json.dumps(state, separators=(",", ":"))
                db_conn.execute(
                    """
                    UPDATE coop_stage_state
                    SET state_json=?, version=?, updated_at=?
                    WHERE party_id=? AND stage_key=?
                    """,
                    (serialized, version, ts, party_id, stage_key),
                )
                db_conn.commit()

            self.send_json(
                200,
                {
                    "success": True,
                    "partyId": party_id,
                    "stage": {"level": level, "stage": stage, "floor": floor},
                    "version": version,
                    "updatedAt": ts,
                    "enemy": target_enemy,
                },
            )
            return

        if path == "/api/coop/loot/claim":
            user = self.require_auth()
            if not user:
                return
            user_id = int(user["id"])
            username = str(user["username"])

            parsed = parse_stage_triplet(body.get("level"), body.get("stage"), body.get("floor"))
            if not parsed:
                self.send_json(400, {"success": False, "error": "Invalid level/stage/floor"})
                return
            level, stage, floor, stage_key = parsed

            loot_key = str(body.get("lootKey") or "").strip()
            if not loot_key or len(loot_key) > 160:
                self.send_json(400, {"success": False, "error": "Invalid loot key"})
                return

            with db_lock:
                party_id = get_user_party_id(user_id)
                if not party_id:
                    self.send_json(403, {"success": False, "error": "Join a party to use co-op sync"})
                    return

                existing = db_one(
                    """
                    SELECT cl.owner_user_id, u.username AS owner_name
                    FROM coop_loot_claims cl
                    JOIN users u ON u.id = cl.owner_user_id
                    WHERE cl.party_id=? AND cl.stage_key=? AND cl.loot_key=?
                    LIMIT 1
                    """,
                    (party_id, stage_key, loot_key),
                )
                if existing:
                    owner_id = int(existing["owner_user_id"])
                    owner_name = existing["owner_name"]
                    self.send_json(
                        200,
                        {
                            "success": True,
                            "partyId": party_id,
                            "stage": {"level": level, "stage": stage, "floor": floor},
                            "lootKey": loot_key,
                            "granted": owner_id == user_id,
                            "owner": owner_name,
                        },
                    )
                    return

                try:
                    db_conn.execute(
                        """
                        INSERT INTO coop_loot_claims(party_id, stage_key, loot_key, owner_user_id, claimed_at)
                        VALUES(?,?,?,?,?)
                        """,
                        (party_id, stage_key, loot_key, user_id, now_ts()),
                    )
                    db_conn.commit()
                except sqlite3.IntegrityError:
                    row = db_one(
                        """
                        SELECT cl.owner_user_id, u.username AS owner_name
                        FROM coop_loot_claims cl
                        JOIN users u ON u.id = cl.owner_user_id
                        WHERE cl.party_id=? AND cl.stage_key=? AND cl.loot_key=?
                        LIMIT 1
                        """,
                        (party_id, stage_key, loot_key),
                    )
                    owner_id = int(row["owner_user_id"]) if row else -1
                    owner_name = row["owner_name"] if row else None
                    self.send_json(
                        200,
                        {
                            "success": True,
                            "partyId": party_id,
                            "stage": {"level": level, "stage": stage, "floor": floor},
                            "lootKey": loot_key,
                            "granted": owner_id == user_id,
                            "owner": owner_name,
                        },
                    )
                    return

            self.send_json(
                200,
                {
                    "success": True,
                    "partyId": party_id,
                    "stage": {"level": level, "stage": stage, "floor": floor},
                    "lootKey": loot_key,
                    "granted": True,
                    "owner": username,
                },
            )
            return

        if path == "/api/social/friend-request":
            user = self.require_auth()
            if not user:
                return
            user_id = int(user["id"])
            target_name = (body.get("username") or "").strip()
            if not target_name:
                self.send_json(400, {"success": False, "error": "Missing target username"})
                return

            with db_lock:
                target = get_user_by_username(target_name)
                if not target:
                    self.send_json(404, {"success": False, "error": "User not found"})
                    return
                target_id = int(target["id"])
                if target_id == user_id:
                    self.send_json(400, {"success": False, "error": "You cannot add yourself"})
                    return
                if are_friends(user_id, target_id):
                    self.send_json(409, {"success": False, "error": "Already friends"})
                    return

                pending = db_one(
                    """
                    SELECT id FROM friend_requests
                    WHERE status='pending'
                      AND ((from_user=? AND to_user=?) OR (from_user=? AND to_user=?))
                    LIMIT 1
                    """,
                    (user_id, target_id, target_id, user_id),
                )
                if pending:
                    self.send_json(409, {"success": False, "error": "Friend request already pending"})
                    return

                db_conn.execute(
                    """
                    INSERT INTO friend_requests(from_user, to_user, status, created_at)
                    VALUES(?, ?, 'pending', ?)
                    """,
                    (user_id, target_id, now_ts()),
                )
                db_conn.commit()
            self.send_json(200, {"success": True})
            return

        if path == "/api/social/friend-respond":
            user = self.require_auth()
            if not user:
                return
            user_id = int(user["id"])
            request_id = int(body.get("requestId") or 0)
            action = (body.get("action") or "").strip().lower()
            if request_id <= 0 or action not in ("accept", "reject"):
                self.send_json(400, {"success": False, "error": "Invalid response payload"})
                return

            with db_lock:
                req = db_one(
                    """
                    SELECT * FROM friend_requests
                    WHERE id=? AND to_user=? AND status='pending'
                    LIMIT 1
                    """,
                    (request_id, user_id),
                )
                if not req:
                    self.send_json(404, {"success": False, "error": "Friend request not found"})
                    return

                from_user = int(req["from_user"])
                status = "accepted" if action == "accept" else "rejected"
                db_conn.execute(
                    "UPDATE friend_requests SET status=?, responded_at=? WHERE id=?",
                    (status, now_ts(), request_id),
                )
                if action == "accept":
                    a, b = normalize_pair(user_id, from_user)
                    db_conn.execute(
                        """
                        INSERT OR IGNORE INTO friendships(user_a, user_b, created_at)
                        VALUES(?,?,?)
                        """,
                        (a, b, now_ts()),
                    )
                db_conn.commit()
            self.send_json(200, {"success": True})
            return

        if path == "/api/social/message":
            user = self.require_auth()
            if not user:
                return
            user_id = int(user["id"])
            target_name = (body.get("to") or "").strip()
            message = (body.get("body") or "").strip()
            if not target_name:
                self.send_json(400, {"success": False, "error": "Missing target username"})
                return
            if not message:
                self.send_json(400, {"success": False, "error": "Message cannot be empty"})
                return
            if len(message) > 300:
                self.send_json(400, {"success": False, "error": "Message too long (max 300 chars)"})
                return

            with db_lock:
                target = get_user_by_username(target_name)
                if not target:
                    self.send_json(404, {"success": False, "error": "User not found"})
                    return
                target_id = int(target["id"])
                if not are_friends(user_id, target_id):
                    self.send_json(403, {"success": False, "error": "You can only message friends"})
                    return
                ts = now_ts()
                db_conn.execute(
                    """
                    INSERT INTO messages(from_user, to_user, body, created_at)
                    VALUES(?,?,?,?)
                    """,
                    (user_id, target_id, message, ts),
                )
                message_id_row = db_one("SELECT last_insert_rowid() AS id")
                db_conn.commit()
            self.send_json(
                200,
                {
                    "success": True,
                    "message": {
                        "id": int(message_id_row["id"]) if message_id_row else 0,
                        "from": user["username"],
                        "to": target["username"],
                        "body": message,
                        "createdAt": ts,
                    },
                },
            )
            return

        if path == "/api/social/party/create":
            user = self.require_auth()
            if not user:
                return
            user_id = int(user["id"])
            ts = now_ts()
            with db_lock:
                party_id = get_user_party_id(user_id)
                if party_id:
                    info = get_party_info(party_id)
                    self.send_json(200, {"success": True, "party": info})
                    return

                db_conn.execute(
                    """
                    INSERT INTO parties(leader_id, created_at, updated_at)
                    VALUES(?,?,?)
                    """,
                    (user_id, ts, ts),
                )
                party_row = db_one("SELECT last_insert_rowid() AS id")
                party_id = int(party_row["id"])
                db_conn.execute(
                    """
                    INSERT INTO party_members(party_id, user_id, status, joined_at)
                    VALUES(?, ?, 'active', ?)
                    """,
                    (party_id, user_id, ts),
                )
                db_conn.commit()
                info = get_party_info(party_id)
            self.send_json(200, {"success": True, "party": info})
            return

        if path == "/api/social/party/invite":
            user = self.require_auth()
            if not user:
                return
            user_id = int(user["id"])
            target_name = (body.get("username") or "").strip()
            if not target_name:
                self.send_json(400, {"success": False, "error": "Missing username to invite"})
                return

            with db_lock:
                if not valid_username(target_name):
                    self.send_json(400, {"success": False, "error": "Invalid username"})
                    return

                target = get_user_by_username(target_name)
                if not target:
                    self.send_json(404, {"success": False, "error": "User not found"})
                    return
                target_id = int(target["id"])
                if target_id == user_id:
                    self.send_json(400, {"success": False, "error": "You cannot invite yourself"})
                    return
                if not are_friends(user_id, target_id):
                    self.send_json(403, {"success": False, "error": "You can only invite friends"})
                    return

                party_id = get_user_party_id(user_id)
                if not party_id:
                    ts = now_ts()
                    db_conn.execute(
                        """
                        INSERT INTO parties(leader_id, created_at, updated_at)
                        VALUES(?,?,?)
                        """,
                        (user_id, ts, ts),
                    )
                    row = db_one("SELECT last_insert_rowid() AS id")
                    party_id = int(row["id"])
                    db_conn.execute(
                        """
                        INSERT INTO party_members(party_id, user_id, status, joined_at)
                        VALUES(?, ?, 'active', ?)
                        """,
                        (party_id, user_id, ts),
                    )
                party = db_one("SELECT leader_id FROM parties WHERE id=?", (party_id,))
                if not party or int(party["leader_id"]) != user_id:
                    self.send_json(403, {"success": False, "error": "Only party leader can invite"})
                    return

                already_member = db_one(
                    """
                    SELECT 1 FROM party_members
                    WHERE party_id=? AND user_id=? AND status='active'
                    LIMIT 1
                    """,
                    (party_id, target_id),
                )
                if already_member:
                    self.send_json(409, {"success": False, "error": "User is already in your party"})
                    return

                pending = db_one(
                    """
                    SELECT id FROM party_invites
                    WHERE party_id=? AND to_user=? AND status='pending'
                    LIMIT 1
                    """,
                    (party_id, target_id),
                )
                if pending:
                    self.send_json(409, {"success": False, "error": "Invite already pending"})
                    return

                db_conn.execute(
                    """
                    INSERT INTO party_invites(party_id, from_user, to_user, status, created_at)
                    VALUES(?, ?, ?, 'pending', ?)
                    """,
                    (party_id, user_id, target_id, now_ts()),
                )
                db_conn.execute("UPDATE parties SET updated_at=? WHERE id=?", (now_ts(), party_id))
                db_conn.commit()
            self.send_json(200, {"success": True})
            return

        if path == "/api/social/party/respond":
            user = self.require_auth()
            if not user:
                return
            user_id = int(user["id"])
            invite_id = int(body.get("inviteId") or 0)
            action = (body.get("action") or "").strip().lower()
            if invite_id <= 0 or action not in ("accept", "reject"):
                self.send_json(400, {"success": False, "error": "Invalid party response"})
                return

            with db_lock:
                invite = db_one(
                    """
                    SELECT * FROM party_invites
                    WHERE id=? AND to_user=? AND status='pending'
                    LIMIT 1
                    """,
                    (invite_id, user_id),
                )
                if not invite:
                    self.send_json(404, {"success": False, "error": "Party invite not found"})
                    return

                party_id = int(invite["party_id"])
                ts = now_ts()
                if action == "accept":
                    old_party_id = get_user_party_id(user_id)
                    if old_party_id and old_party_id != party_id:
                        db_conn.execute(
                            "DELETE FROM party_members WHERE party_id=? AND user_id=?",
                            (old_party_id, user_id),
                        )
                        cleanup_party_if_empty(old_party_id)

                    party_exists = db_one("SELECT id FROM parties WHERE id=?", (party_id,))
                    if not party_exists:
                        db_conn.execute(
                            "UPDATE party_invites SET status='rejected', responded_at=? WHERE id=?",
                            (ts, invite_id),
                        )
                        db_conn.commit()
                        self.send_json(410, {"success": False, "error": "Party no longer exists"})
                        return

                    db_conn.execute(
                        """
                        INSERT INTO party_members(party_id, user_id, status, joined_at)
                        VALUES(?, ?, 'active', ?)
                        ON CONFLICT(party_id, user_id) DO UPDATE SET status='active'
                        """,
                        (party_id, user_id, ts),
                    )
                    db_conn.execute("UPDATE parties SET updated_at=? WHERE id=?", (ts, party_id))
                    db_conn.execute(
                        "UPDATE party_invites SET status='accepted', responded_at=? WHERE id=?",
                        (ts, invite_id),
                    )
                else:
                    db_conn.execute(
                        "UPDATE party_invites SET status='rejected', responded_at=? WHERE id=?",
                        (ts, invite_id),
                    )
                db_conn.commit()

                member_party_id = get_user_party_id(user_id)
                info = get_party_info(member_party_id) if member_party_id else None

            self.send_json(200, {"success": True, "party": info})
            return

        if path == "/api/social/party/leave":
            user = self.require_auth()
            if not user:
                return
            user_id = int(user["id"])
            with db_lock:
                party_id = get_user_party_id(user_id)
                if not party_id:
                    self.send_json(200, {"success": True, "party": None})
                    return
                db_conn.execute(
                    "DELETE FROM party_members WHERE party_id=? AND user_id=?",
                    (party_id, user_id),
                )
                db_conn.execute("UPDATE parties SET updated_at=? WHERE id=?", (now_ts(), party_id))
                cleanup_party_if_empty(party_id)
                db_conn.commit()
            self.send_json(200, {"success": True, "party": None})
            return

        if path == "/api/social/presence/update":
            user = self.require_auth()
            if not user:
                return
            user_id = int(user["id"])
            status = (body.get("status") or "online").strip().lower()
            if status not in ("online", "in_run", "away", "offline"):
                status = "online"
            in_game = bool_int(body.get("inGame", False))
            level = int(body.get("level") or 0)
            stage = int(body.get("stage") or 0)
            floor = int(body.get("floor") or 0)
            pos_x = float(body.get("x") or 0.0)
            pos_y = float(body.get("y") or 0.0)
            ts = now_ts()
            with db_lock:
                db_conn.execute(
                    """
                    INSERT INTO presence(user_id, status, in_game, level, stage, floor, pos_x, pos_y, updated_at)
                    VALUES(?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(user_id) DO UPDATE SET
                        status=excluded.status,
                        in_game=excluded.in_game,
                        level=excluded.level,
                        stage=excluded.stage,
                        floor=excluded.floor,
                        pos_x=excluded.pos_x,
                        pos_y=excluded.pos_y,
                        updated_at=excluded.updated_at
                    """,
                    (user_id, status, in_game, level, stage, floor, pos_x, pos_y, ts),
                )
                db_conn.execute(
                    "UPDATE users SET status=?, last_seen=? WHERE id=?",
                    ("online" if status != "offline" else "offline", ts, user_id),
                )
                db_conn.commit()
            self.send_json(200, {"success": True, "updatedAt": ts})
            return

        self.send_json(404, {"success": False, "error": "Unknown API route"})


def run_server(host: str, port: int) -> None:
    init_db()
    server = ThreadingHTTPServer((host, port), ShadowHandler)
    print("=" * 48)
    print(" SHADOW DEPTHS - MULTIPLAYER SERVER")
    print("=" * 48)
    print(f"Serving: {ROOT_DIR}")
    print(f"DB file: {DB_PATH}")
    print(f"URL:     http://{host}:{port}")
    print("=" * 48)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Shadow Depths multiplayer LAN server")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host (default 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8080, help="Bind port (default 8080)")
    args = parser.parse_args()
    run_server(args.host, args.port)


if __name__ == "__main__":
    main()
