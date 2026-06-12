/**
 * new.js – FIFA 2026 SQLite Database Creator (Updated with isodate columns and modern views)
 * Creates a complete database with tables, indexes, views, bracket rules, and all match data.
 * Dependencies: JaferSQL (must be loaded before this script)
 */
(function() {
    'use strict';

    // ============================================================
    // 1. COMPLETE SQL SCHEMA (from schema.sql – includes isodate)
    // ============================================================
    const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE cities (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE groups (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE stadiums (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    cityId INTEGER NOT NULL,
    FOREIGN KEY (cityId) REFERENCES cities(id)
);

CREATE TABLE stages (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    "order" INTEGER NOT NULL
);

CREATE TABLE teams (
    id INTEGER PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    flag TEXT NOT NULL
);

CREATE TABLE matches (
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    isodate TEXT NOT NULL,
    homeTeamId INTEGER,
    awayTeamId INTEGER,
    groupId INTEGER,
    stageId INTEGER NOT NULL,
    stadiumId INTEGER NOT NULL,
    cityId INTEGER NOT NULL,
    FOREIGN KEY (homeTeamId) REFERENCES teams(id),
    FOREIGN KEY (awayTeamId) REFERENCES teams(id),
    FOREIGN KEY (groupId) REFERENCES groups(id),
    FOREIGN KEY (stageId) REFERENCES stages(id),
    FOREIGN KEY (stadiumId) REFERENCES stadiums(id),
    FOREIGN KEY (cityId) REFERENCES cities(id)
);

CREATE TABLE bracket_rules (
    matchNumber INTEGER PRIMARY KEY,
    stageId INTEGER NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    isodate TEXT NOT NULL,
    stadiumId INTEGER NOT NULL,
    cityId INTEGER NOT NULL,
    homeRule TEXT NOT NULL,
    awayRule TEXT NOT NULL,
    FOREIGN KEY (stageId) REFERENCES stages(id),
    FOREIGN KEY (stadiumId) REFERENCES stadiums(id),
    FOREIGN KEY (cityId) REFERENCES cities(id)
);

CREATE TABLE match_scores (
    id INTEGER PRIMARY KEY,
    matchId INTEGER NOT NULL UNIQUE,
    homeScoreFullTime INTEGER DEFAULT 0,
    awayScoreFullTime INTEGER DEFAULT 0,
    homeScoreHalfTime INTEGER,
    awayScoreHalfTime INTEGER,
    homeScoreExtraTime INTEGER,
    awayScoreExtraTime INTEGER,
    homeScorePenalties INTEGER,
    awayScorePenalties INTEGER,
    status TEXT DEFAULT 'scheduled',
    lastUpdated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (matchId) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE TABLE match_events (
    id INTEGER PRIMARY KEY,
    matchId INTEGER NOT NULL,
    teamId INTEGER NOT NULL,
    playerName TEXT NOT NULL,
    eventType TEXT NOT NULL,
    eventMinute INTEGER NOT NULL,
    eventMinuteExtra INTEGER DEFAULT 0,
    additionalInfo TEXT,
    FOREIGN KEY (matchId) REFERENCES matches(id) ON DELETE CASCADE,
    FOREIGN KEY (teamId) REFERENCES teams(id)
);

CREATE INDEX idx_bracket_rules_date ON bracket_rules(date);
CREATE INDEX idx_bracket_rules_stage ON bracket_rules(stageId);
CREATE INDEX idx_bracket_rules_isodate ON bracket_rules(isodate);
CREATE INDEX idx_match_events_match ON match_events(matchId);
CREATE INDEX idx_match_events_team ON match_events(teamId);
CREATE INDEX idx_match_events_type ON match_events(eventType);
CREATE INDEX idx_match_scores_match ON match_scores(matchId);
CREATE INDEX idx_matches_awayTeam ON matches(awayTeamId);
CREATE INDEX idx_matches_city ON matches(cityId);
CREATE INDEX idx_matches_group ON matches(groupId);
CREATE INDEX idx_matches_homeTeam ON matches(homeTeamId);
CREATE INDEX idx_matches_stadium ON matches(stadiumId);
CREATE INDEX idx_matches_stage ON matches(stageId);
CREATE INDEX idx_matches_isodate ON matches(isodate);
CREATE INDEX idx_stadiums_city ON stadiums(cityId);

CREATE VIEW match_details AS
SELECT 
    m.id,
    m.date,
    m.time,
    m.isodate,
    homeTeam.name AS homeTeam,
    awayTeam.name AS awayTeam,
    homeTeam.code AS homeTeamCode,
    awayTeam.code AS awayTeamCode,
    g.name AS groupName,
    s.name AS stageName,
    st.name AS stadium,
    c.name AS city,
    ms.homeScoreFullTime,
    ms.awayScoreFullTime,
    ms.homeScoreHalfTime,
    ms.awayScoreHalfTime,
    ms.homeScoreExtraTime,
    ms.awayScoreExtraTime,
    ms.homeScorePenalties,
    ms.awayScorePenalties,
    ms.status AS matchStatus,
    m.stageId
FROM matches m
LEFT JOIN teams homeTeam ON m.homeTeamId = homeTeam.id
LEFT JOIN teams awayTeam ON m.awayTeamId = awayTeam.id
LEFT JOIN groups g ON m.groupId = g.id
LEFT JOIN stages s ON m.stageId = s.id
LEFT JOIN stadiums st ON m.stadiumId = st.id
LEFT JOIN cities c ON m.cityId = c.id
LEFT JOIN match_scores ms ON m.id = ms.matchId;

CREATE VIEW match_details_sorted AS
SELECT 
    md.*,
    home.flag AS homeFlag,
    away.flag AS awayFlag,
    md.isodate AS sort_date,
    md.isodate AS date_iso
FROM match_details md
LEFT JOIN teams home ON home.name = md.homeTeam
LEFT JOIN teams away ON away.name = md.awayTeam;

CREATE VIEW unified_matches AS
SELECT 
    id,
    isodate AS date,
    time,
    homeTeam,
    awayTeam,
    homeFlag,
    awayFlag,
    homeScoreFullTime,
    awayScoreFullTime,
    matchStatus,
    stadium,
    city,
    groupName,
    stageName,
    isodate AS sort_date,
    NULL AS homeTeamId,
    NULL AS awayTeamId,
    NULL AS homeRule,
    NULL AS awayRule
FROM match_details_sorted
WHERE stageId = 1

UNION ALL

SELECT
    kmr.matchNumber AS id,
    kmr.isodate AS date,
    kmr.time,
    COALESCE(kmr.homeTeamName, kmr.homeRule) AS homeTeam,
    COALESCE(kmr.awayTeamName, kmr.awayRule) AS awayTeam,
    kmr.homeFlag,
    kmr.awayFlag,
    NULL AS homeScoreFullTime,
    NULL AS awayScoreFullTime,
    'scheduled' AS matchStatus,
    kmr.stadium,
    kmr.city,
    NULL AS groupName,
    kmr.stageName,
    kmr.isodate AS sort_date,
    kmr.homeTeamId,
    kmr.awayTeamId,
    kmr.homeRule,
    kmr.awayRule
FROM knockout_with_flags kmr
WHERE kmr.stageId >= 2;

CREATE VIEW current_matchday AS
SELECT 
    stageId,
    stageName,
    MIN(isodate) AS next_match_date,
    (SELECT id FROM match_details WHERE stageId = m.stageId AND isodate = MIN(m.isodate) LIMIT 1) AS next_match_id
FROM match_details m
GROUP BY stageId;

CREATE VIEW finished_matches AS
SELECT * FROM unified_matches
WHERE matchStatus = 'finished'
ORDER BY isodate DESC, time DESC;

CREATE VIEW upcoming_matches AS
SELECT * FROM unified_matches
WHERE isodate >= date('now')
ORDER BY isodate, time;

CREATE VIEW group_standings_raw AS
SELECT 
    m.groupId,
    t.id AS teamId,
    COUNT(*) AS played,
    SUM(CASE 
        WHEN ms.homeScoreFullTime > ms.awayScoreFullTime AND m.homeTeamId = t.id THEN 1
        WHEN ms.awayScoreFullTime > ms.homeScoreFullTime AND m.awayTeamId = t.id THEN 1
        ELSE 0 
    END) AS wins,
    SUM(CASE 
        WHEN ms.homeScoreFullTime = ms.awayScoreFullTime AND ms.homeScoreFullTime IS NOT NULL THEN 1
        ELSE 0 
    END) AS draws,
    SUM(CASE 
        WHEN ms.homeScoreFullTime < ms.awayScoreFullTime AND m.homeTeamId = t.id THEN 1
        WHEN ms.awayScoreFullTime < ms.homeScoreFullTime AND m.awayTeamId = t.id THEN 1
        ELSE 0 
    END) AS losses,
    SUM(CASE 
        WHEN m.homeTeamId = t.id THEN COALESCE(ms.homeScoreFullTime, 0)
        ELSE COALESCE(ms.awayScoreFullTime, 0)
    END) AS goalsFor,
    SUM(CASE 
        WHEN m.homeTeamId = t.id THEN COALESCE(ms.awayScoreFullTime, 0)
        ELSE COALESCE(ms.homeScoreFullTime, 0)
    END) AS goalsAgainst,
    SUM(CASE 
        WHEN m.homeTeamId = t.id THEN COALESCE(ms.homeScoreFullTime, 0) - COALESCE(ms.awayScoreFullTime, 0)
        ELSE COALESCE(ms.awayScoreFullTime, 0) - COALESCE(ms.homeScoreFullTime, 0)
    END) AS goalDifference,
    SUM(CASE 
        WHEN ms.homeScoreFullTime > ms.awayScoreFullTime AND m.homeTeamId = t.id THEN 3
        WHEN ms.awayScoreFullTime > ms.homeScoreFullTime AND m.awayTeamId = t.id THEN 3
        WHEN ms.homeScoreFullTime = ms.awayScoreFullTime THEN 1
        ELSE 0 
    END) AS points
FROM matches m
JOIN teams t ON (t.id = m.homeTeamId OR t.id = m.awayTeamId)
LEFT JOIN match_scores ms ON m.id = ms.matchId
WHERE m.stageId = 1
  AND m.groupId IS NOT NULL
  AND ms.status = 'finished'
GROUP BY m.groupId, t.id;

CREATE VIEW group_standings AS
SELECT 
    g.id AS groupId,
    g.name AS groupName,
    r.teamId,
    t.name AS teamName,
    t.code AS teamCode,
    t.flag AS teamFlag,
    r.played,
    r.wins,
    r.draws,
    r.losses,
    r.goalsFor,
    r.goalsAgainst,
    r.goalDifference,
    r.points,
    ROW_NUMBER() OVER (
        PARTITION BY r.groupId 
        ORDER BY r.points DESC, r.goalDifference DESC, r.goalsFor DESC
    ) AS rank
FROM group_standings_raw r
JOIN groups g ON r.groupId = g.id
JOIN teams t ON r.teamId = t.id;

CREATE VIEW group_standings_full AS
WITH group_teams AS (
    SELECT DISTINCT m.groupId, t.id AS teamId
    FROM matches m
    JOIN teams t ON t.id = m.homeTeamId OR t.id = m.awayTeamId
    WHERE m.groupId IS NOT NULL
)
SELECT 
    g.id AS groupId,
    g.name AS groupName,
    gt.teamId,
    t.name AS teamName,
    t.code AS teamCode,
    t.flag AS teamFlag,
    COALESCE(r.played, 0) AS played,
    COALESCE(r.wins, 0) AS wins,
    COALESCE(r.draws, 0) AS draws,
    COALESCE(r.losses, 0) AS losses,
    COALESCE(r.goalsFor, 0) AS goalsFor,
    COALESCE(r.goalsAgainst, 0) AS goalsAgainst,
    COALESCE(r.goalDifference, 0) AS goalDifference,
    COALESCE(r.points, 0) AS points,
    ROW_NUMBER() OVER (
        PARTITION BY g.id 
        ORDER BY COALESCE(r.points, 0) DESC, 
                 COALESCE(r.goalDifference, 0) DESC, 
                 COALESCE(r.goalsFor, 0) DESC,
                 t.name ASC
    ) AS rank
FROM groups g
JOIN group_teams gt ON g.id = gt.groupId
JOIN teams t ON gt.teamId = t.id
LEFT JOIN group_standings_raw r ON r.groupId = g.id AND r.teamId = t.id;

CREATE VIEW group_standings_simple AS
SELECT 
    g.name AS groupName,
    t.name AS teamName,
    t.code AS teamCode,
    t.flag AS teamFlag,
    r.played,
    r.wins,
    r.draws,
    r.losses,
    r.goalsFor,
    r.goalsAgainst,
    r.goalDifference,
    r.points
FROM group_standings_raw r
JOIN groups g ON r.groupId = g.id
JOIN teams t ON r.teamId = t.id
ORDER BY g.id, r.points DESC, r.goalDifference DESC, r.goalsFor DESC;

CREATE VIEW best_third_placed AS
SELECT 
    groupId,
    groupName,
    teamId,
    teamName,
    points,
    goalDifference,
    goalsFor,
    RANK() OVER (ORDER BY points DESC, goalDifference DESC, goalsFor DESC) AS third_rank
FROM group_standings
WHERE rank = 3
ORDER BY points DESC, goalDifference DESC, goalsFor DESC
LIMIT 4;

CREATE VIEW team_match_history AS
SELECT 
    t.id AS teamId,
    t.name AS teamName,
    m.id AS matchId,
    m.isodate AS date,
    m.time,
    CASE 
        WHEN m.homeTeamId = t.id THEN 'home'
        ELSE 'away'
    END AS venue,
    CASE 
        WHEN m.homeTeamId = t.id THEN awayTeam.name
        ELSE homeTeam.name
    END AS opponent,
    s.name AS stage,
    st.name AS stadium,
    c.name AS city,
    CASE 
        WHEN m.homeTeamId = t.id THEN ms.homeScoreFullTime
        ELSE ms.awayScoreFullTime
    END AS teamScore,
    CASE 
        WHEN m.homeTeamId = t.id THEN ms.awayScoreFullTime
        ELSE ms.homeScoreFullTime
    END AS opponentScore,
    CASE 
        WHEN (m.homeTeamId = t.id AND ms.homeScoreFullTime > ms.awayScoreFullTime) OR
             (m.awayTeamId = t.id AND ms.awayScoreFullTime > ms.homeScoreFullTime) THEN 'W'
        WHEN (m.homeTeamId = t.id AND ms.homeScoreFullTime < ms.awayScoreFullTime) OR
             (m.awayTeamId = t.id AND ms.awayScoreFullTime < ms.homeScoreFullTime) THEN 'L'
        WHEN ms.homeScoreFullTime = ms.awayScoreFullTime THEN 'D'
        ELSE '-'
    END AS result,
    ms.status
FROM teams t
JOIN matches m ON t.id = m.homeTeamId OR t.id = m.awayTeamId
LEFT JOIN teams homeTeam ON m.homeTeamId = homeTeam.id
LEFT JOIN teams awayTeam ON m.awayTeamId = awayTeam.id
LEFT JOIN stages s ON m.stageId = s.id
LEFT JOIN stadiums st ON m.stadiumId = st.id
LEFT JOIN cities c ON m.cityId = c.id
LEFT JOIN match_scores ms ON m.id = ms.matchId
ORDER BY t.id, m.isodate;

CREATE VIEW team_form AS
SELECT 
    teamId,
    teamName,
    GROUP_CONCAT(result, '') AS form_last5
FROM (
    SELECT 
        teamId,
        teamName,
        result,
        ROW_NUMBER() OVER (PARTITION BY teamId ORDER BY date DESC) AS rn
    FROM team_match_history
    WHERE result IN ('W','D','L')
) t
WHERE rn <= 5
GROUP BY teamId;

CREATE VIEW team_group_summary AS
SELECT 
    gs.groupId,
    gs.groupName,
    gs.teamId,
    gs.teamName,
    gs.teamCode,
    gs.teamFlag,
    gs.played,
    gs.wins,
    gs.draws,
    gs.losses,
    gs.goalsFor,
    gs.goalsAgainst,
    gs.goalDifference,
    gs.points,
    gs.rank,
    CASE WHEN gs.rank <= 2 THEN 'qualified' 
         WHEN gs.rank = 3 AND (SELECT COUNT(*) FROM group_standings WHERE rank = 3 AND points > 0) <= 4 THEN 'possible_third' 
         ELSE 'eliminated' 
    END AS status
FROM group_standings gs;

CREATE VIEW card_summary AS
SELECT 
    t.id AS teamId,
    t.name AS teamName,
    SUM(CASE WHEN me.eventType = 'yellow_card' THEN 1 ELSE 0 END) AS yellowCards,
    SUM(CASE WHEN me.eventType = 'red_card' THEN 1 ELSE 0 END) AS redCards
FROM match_events me
JOIN teams t ON me.teamId = t.id
GROUP BY me.teamId;

CREATE VIEW own_goals AS
SELECT 
    t.id AS teamId,
    t.name AS teamName,
    me.playerName,
    COUNT(*) AS ownGoals
FROM match_events me
JOIN teams t ON me.teamId = t.id
WHERE me.eventType = 'own_goal'
GROUP BY me.teamId, me.playerName
ORDER BY ownGoals DESC;

CREATE VIEW top_scorers AS
SELECT 
    t.id AS teamId,
    t.name AS teamName,
    t.code AS teamCode,
    me.playerName,
    COUNT(*) AS goals
FROM match_events me
JOIN teams t ON me.teamId = t.id
WHERE me.eventType IN ('goal', 'penalty_goal')
GROUP BY me.teamId, me.playerName
ORDER BY goals DESC, playerName;

CREATE VIEW match_events_details AS
SELECT 
    m.id AS matchId,
    m.isodate AS date,
    homeTeam.name AS homeTeam,
    awayTeam.name AS awayTeam,
    me.eventType,
    me.playerName,
    me.eventMinute,
    me.eventMinuteExtra,
    me.additionalInfo,
    t.name AS team
FROM match_events me
JOIN matches m ON me.matchId = m.id
JOIN teams t ON me.teamId = t.id
LEFT JOIN teams homeTeam ON m.homeTeamId = homeTeam.id
LEFT JOIN teams awayTeam ON m.awayTeamId = awayTeam.id
ORDER BY m.isodate, m.time, me.eventMinute, me.eventMinuteExtra;

CREATE VIEW match_timeline AS
SELECT 
    med.matchId,
    med.homeTeam,
    med.awayTeam,
    GROUP_CONCAT(
        med.eventMinute || CASE WHEN med.eventMinuteExtra > 0 THEN '+' || med.eventMinuteExtra ELSE '' END || 
        ' - ' || med.playerName || ' (' || med.eventType || ')', 
        CHAR(10)
    ) AS timeline
FROM match_events_details med
GROUP BY med.matchId;

CREATE VIEW tournament_progress AS
SELECT 
    (SELECT COUNT(*) FROM matches WHERE stageId = 1) AS total_group_matches,
    (SELECT COUNT(*) FROM match_scores WHERE status = 'finished' AND matchId IN (SELECT id FROM matches WHERE stageId = 1)) AS finished_group_matches,
    (SELECT COUNT(*) FROM matches WHERE stageId >= 2) AS total_knockout_matches,
    (SELECT COUNT(*) FROM match_scores WHERE status = 'finished' AND matchId IN (SELECT id FROM matches WHERE stageId >= 2)) AS finished_knockout_matches,
    (SELECT SUM(homeScoreFullTime + awayScoreFullTime) FROM match_scores WHERE status = 'finished') AS total_goals,
    (SELECT COUNT(*) FROM match_events WHERE eventType IN ('goal','penalty_goal')) AS total_goals_events,
    (SELECT COUNT(*) FROM match_events WHERE eventType IN ('yellow_card','red_card')) AS total_cards;

CREATE VIEW head_to_head AS
SELECT 
    t1.name AS team1,
    t2.name AS team2,
    m.isodate AS date,
    m.stageName,
    CASE 
        WHEN m.homeTeam = t1.name AND m.awayTeam = t2.name THEN 'home'
        WHEN m.homeTeam = t2.name AND m.awayTeam = t1.name THEN 'away'
    END AS venue,
    m.homeScoreFullTime,
    m.awayScoreFullTime,
    CASE 
        WHEN (m.homeTeam = t1.name AND m.homeScoreFullTime > m.awayScoreFullTime) OR
             (m.awayTeam = t1.name AND m.awayScoreFullTime > m.homeScoreFullTime) THEN t1.name
        WHEN (m.homeTeam = t2.name AND m.homeScoreFullTime > m.awayScoreFullTime) OR
             (m.awayTeam = t2.name AND m.awayScoreFullTime > m.homeScoreFullTime) THEN t2.name
        ELSE 'Draw'
    END AS winner
FROM match_details m
CROSS JOIN (SELECT name FROM teams) t1
CROSS JOIN (SELECT name FROM teams) t2
WHERE t1.name < t2.name
  AND ((m.homeTeam = t1.name AND m.awayTeam = t2.name) OR
       (m.homeTeam = t2.name AND m.awayTeam = t1.name));

CREATE VIEW knockout_bracket AS
SELECT 
    m.id,
    m.isodate AS date,
    m.time,
    s.name AS stage,
    s."order" AS stageOrder,
    homeTeam.name AS homeTeam,
    awayTeam.name AS awayTeam,
    st.name AS stadium,
    c.name AS city,
    ms.homeScoreFullTime,
    ms.awayScoreFullTime,
    ms.homeScorePenalties,
    ms.awayScorePenalties,
    ms.status
FROM matches m
JOIN stages s ON m.stageId = s.id
LEFT JOIN teams homeTeam ON m.homeTeamId = homeTeam.id
LEFT JOIN teams awayTeam ON m.awayTeamId = awayTeam.id
LEFT JOIN stadiums st ON m.stadiumId = st.id
LEFT JOIN cities c ON m.cityId = c.id
LEFT JOIN match_scores ms ON m.id = ms.matchId
WHERE m.stageId >= 2
ORDER BY s."order", m.id;

CREATE VIEW match_results_view AS
SELECT 
    m.id AS matchId,
    CASE 
        WHEN ms.homeScoreFullTime > ms.awayScoreFullTime THEN m.homeTeamId
        WHEN ms.awayScoreFullTime > ms.homeScoreFullTime THEN m.awayTeamId
        ELSE NULL
    END AS winnerId,
    CASE 
        WHEN ms.homeScoreFullTime > ms.awayScoreFullTime THEN m.awayTeamId
        WHEN ms.awayScoreFullTime > ms.homeScoreFullTime THEN m.homeTeamId
        ELSE NULL
    END AS loserId
FROM matches m
INNER JOIN match_scores ms ON m.id = ms.matchId
WHERE ms.status = 'finished' AND m.stageId >= 2;

CREATE VIEW split_letters_view AS
SELECT '3ABCDF' AS rule_str, 'A' AS letter UNION ALL
SELECT '3ABCDF', 'B' UNION ALL
SELECT '3ABCDF', 'C' UNION ALL
SELECT '3ABCDF', 'D' UNION ALL
SELECT '3ABCDF', 'F' UNION ALL
SELECT '3CDFGH', 'C' UNION ALL
SELECT '3CDFGH', 'D' UNION ALL
SELECT '3CDFGH', 'F' UNION ALL
SELECT '3CDFGH', 'G' UNION ALL
SELECT '3CDFGH', 'H' UNION ALL
SELECT '3CEFHI', 'C' UNION ALL
SELECT '3CEFHI', 'E' UNION ALL
SELECT '3CEFHI', 'F' UNION ALL
SELECT '3CEFHI', 'H' UNION ALL
SELECT '3CEFHI', 'I' UNION ALL
SELECT '3EHIJK', 'E' UNION ALL
SELECT '3EHIJK', 'H' UNION ALL
SELECT '3EHIJK', 'I' UNION ALL
SELECT '3EHIJK', 'J' UNION ALL
SELECT '3EHIJK', 'K' UNION ALL
SELECT '3BEFIJ', 'B' UNION ALL
SELECT '3BEFIJ', 'E' UNION ALL
SELECT '3BEFIJ', 'F' UNION ALL
SELECT '3BEFIJ', 'I' UNION ALL
SELECT '3BEFIJ', 'J' UNION ALL
SELECT '3AEHIJ', 'A' UNION ALL
SELECT '3AEHIJ', 'E' UNION ALL
SELECT '3AEHIJ', 'H' UNION ALL
SELECT '3AEHIJ', 'I' UNION ALL
SELECT '3AEHIJ', 'J' UNION ALL
SELECT '3EFGIJ', 'E' UNION ALL
SELECT '3EFGIJ', 'F' UNION ALL
SELECT '3EFGIJ', 'G' UNION ALL
SELECT '3EFGIJ', 'I' UNION ALL
SELECT '3EFGIJ', 'J' UNION ALL
SELECT '3DEIJL', 'D' UNION ALL
SELECT '3DEIJL', 'E' UNION ALL
SELECT '3DEIJL', 'I' UNION ALL
SELECT '3DEIJL', 'J' UNION ALL
SELECT '3DEIJL', 'L';

CREATE VIEW resolved_home_view AS
SELECT 
    br.matchNumber,
    CASE
        WHEN br.homeRule GLOB '1[A-Z]' THEN
            (SELECT teamId FROM group_standings_full WHERE groupName = substr(br.homeRule,2) AND rank = 1 LIMIT 1)
        WHEN br.homeRule GLOB '2[A-Z]' THEN
            (SELECT teamId FROM group_standings_full WHERE groupName = substr(br.homeRule,2) AND rank = 2 LIMIT 1)
        WHEN br.homeRule GLOB 'W[0-9]*' THEN
            (SELECT winnerId FROM match_results_view WHERE matchId = CAST(substr(br.homeRule,2) AS INTEGER))
        WHEN br.homeRule GLOB 'RU[0-9]*' THEN
            (SELECT loserId FROM match_results_view WHERE matchId = CAST(substr(br.homeRule,3) AS INTEGER))
        WHEN br.homeRule GLOB '3[A-Z]*' THEN (
            SELECT teamId FROM group_standings_full gs
            WHERE gs.rank = 3
                AND gs.groupName IN (SELECT letter FROM split_letters_view WHERE rule_str = br.homeRule)
            ORDER BY gs.points DESC, gs.goalDifference DESC, gs.goalsFor DESC
            LIMIT 1
        )
        ELSE NULL
    END AS homeTeamId
FROM bracket_rules br;

CREATE VIEW resolved_away_view AS
SELECT 
    br.matchNumber,
    CASE
        WHEN br.awayRule GLOB '1[A-Z]' THEN
            (SELECT teamId FROM group_standings_full WHERE groupName = substr(br.awayRule,2) AND rank = 1 LIMIT 1)
        WHEN br.awayRule GLOB '2[A-Z]' THEN
            (SELECT teamId FROM group_standings_full WHERE groupName = substr(br.awayRule,2) AND rank = 2 LIMIT 1)
        WHEN br.awayRule GLOB 'W[0-9]*' THEN
            (SELECT winnerId FROM match_results_view WHERE matchId = CAST(substr(br.awayRule,2) AS INTEGER))
        WHEN br.awayRule GLOB 'RU[0-9]*' THEN
            (SELECT loserId FROM match_results_view WHERE matchId = CAST(substr(br.awayRule,3) AS INTEGER))
        WHEN br.awayRule GLOB '3[A-Z]*' THEN (
            SELECT teamId FROM group_standings_full gs
            WHERE gs.rank = 3
                AND gs.groupName IN (SELECT letter FROM split_letters_view WHERE rule_str = br.awayRule)
            ORDER BY gs.points DESC, gs.goalDifference DESC, gs.goalsFor DESC
            LIMIT 1
        )
        ELSE NULL
    END AS awayTeamId
FROM bracket_rules br;

CREATE VIEW knockout_matches_resolved AS
SELECT 
    br.matchNumber,
    br.stageId,
    s.name AS stageName,
    br.date,
    br.time,
    br.stadiumId,
    br.cityId,
    st.name AS stadium,
    c.name AS city,
    br.homeRule,
    br.awayRule,
    rh.homeTeamId,
    ra.awayTeamId,
    (SELECT name FROM teams WHERE id = rh.homeTeamId) AS homeTeamName,
    (SELECT name FROM teams WHERE id = ra.awayTeamId) AS awayTeamName
FROM bracket_rules br
LEFT JOIN stages s ON br.stageId = s.id
LEFT JOIN stadiums st ON br.stadiumId = st.id
LEFT JOIN cities c ON br.cityId = c.id
LEFT JOIN resolved_home_view rh ON br.matchNumber = rh.matchNumber
LEFT JOIN resolved_away_view ra ON br.matchNumber = ra.matchNumber;

CREATE VIEW knockout_matches_resolved_simple AS
WITH
  match_results AS (
    SELECT 
      m.id AS matchId,
      CASE 
        WHEN ms.homeScoreFullTime > ms.awayScoreFullTime THEN m.homeTeamId
        WHEN ms.awayScoreFullTime > ms.homeScoreFullTime THEN m.awayTeamId
        ELSE NULL
      END AS winnerId,
      CASE 
        WHEN ms.homeScoreFullTime > ms.awayScoreFullTime THEN m.awayTeamId
        WHEN ms.awayScoreFullTime > ms.homeScoreFullTime THEN m.homeTeamId
        ELSE NULL
      END AS loserId
    FROM matches m
    INNER JOIN match_scores ms ON m.id = ms.matchId
    WHERE ms.status = 'finished' AND m.stageId >= 2
  ),
  resolved AS (
    SELECT 
      br.matchNumber,
      'home' AS side,
      CASE
        WHEN br.homeRule GLOB '1[A-Z]' THEN
          (SELECT teamId FROM group_standings_full WHERE groupName = substr(br.homeRule,2) AND rank = 1 LIMIT 1)
        WHEN br.homeRule GLOB '2[A-Z]' THEN
          (SELECT teamId FROM group_standings_full WHERE groupName = substr(br.homeRule,2) AND rank = 2 LIMIT 1)
        WHEN br.homeRule GLOB 'W[0-9]*' THEN
          (SELECT winnerId FROM match_results WHERE matchId = CAST(substr(br.homeRule,2) AS INTEGER))
        WHEN br.homeRule GLOB 'RU[0-9]*' THEN
          (SELECT loserId FROM match_results WHERE matchId = CAST(substr(br.homeRule,3) AS INTEGER))
        ELSE NULL
      END AS teamId
    FROM bracket_rules br
    UNION ALL
    SELECT 
      br.matchNumber,
      'away',
      CASE
        WHEN br.awayRule GLOB '1[A-Z]' THEN
          (SELECT teamId FROM group_standings_full WHERE groupName = substr(br.awayRule,2) AND rank = 1 LIMIT 1)
        WHEN br.awayRule GLOB '2[A-Z]' THEN
          (SELECT teamId FROM group_standings_full WHERE groupName = substr(br.awayRule,2) AND rank = 2 LIMIT 1)
        WHEN br.awayRule GLOB 'W[0-9]*' THEN
          (SELECT winnerId FROM match_results WHERE matchId = CAST(substr(br.awayRule,2) AS INTEGER))
        WHEN br.awayRule GLOB 'RU[0-9]*' THEN
          (SELECT loserId FROM match_results WHERE matchId = CAST(substr(br.awayRule,3) AS INTEGER))
        ELSE NULL
      END AS teamId
    FROM bracket_rules br
  )
SELECT 
  br.matchNumber,
  br.stageId,
  s.name AS stageName,
  br.date,
  br.time,
  br.stadiumId,
  br.cityId,
  st.name AS stadium,
  c.name AS city,
  br.homeRule,
  br.awayRule,
  (SELECT teamId FROM resolved WHERE matchNumber = br.matchNumber AND side = 'home') AS homeTeamId,
  (SELECT teamId FROM resolved WHERE matchNumber = br.matchNumber AND side = 'away') AS awayTeamId,
  (SELECT name FROM teams WHERE id = homeTeamId) AS homeTeamName,
  (SELECT name FROM teams WHERE id = awayTeamId) AS awayTeamName
FROM bracket_rules br
LEFT JOIN stages s ON br.stageId = s.id
LEFT JOIN stadiums st ON br.stadiumId = st.id
LEFT JOIN cities c ON br.cityId = c.id;

CREATE VIEW knockout_with_flags AS
SELECT 
    kmr.matchNumber,
    kmr.stageId,
    kmr.stageName,
    kmr.date,
    kmr.time,
    kmr.homeTeamName,
    kmr.awayTeamName,
    kmr.homeRule,
    kmr.awayRule,
    kmr.homeTeamId,
    kmr.awayTeamId,
    kmr.stadium,
    kmr.city,
    ht.flag AS homeFlag,
    at.flag AS awayFlag
FROM knockout_matches_resolved kmr
LEFT JOIN teams ht ON kmr.homeTeamId = ht.id
LEFT JOIN teams at ON kmr.awayTeamId = at.id;

CREATE TRIGGER prevent_score_change_after_finish
BEFORE UPDATE OF homeScoreFullTime, awayScoreFullTime, status ON match_scores
FOR EACH ROW
WHEN OLD.status = 'finished' AND NEW.status = 'finished'
BEGIN
    SELECT RAISE(ABORT, 'Cannot modify scores of a finished match');
END;

CREATE TRIGGER update_last_updated
AFTER UPDATE OF homeScoreFullTime, awayScoreFullTime, 
              homeScoreHalfTime, awayScoreHalfTime,
              homeScoreExtraTime, awayScoreExtraTime,
              homeScorePenalties, awayScorePenalties
ON match_scores
FOR EACH ROW
BEGIN
    UPDATE match_scores SET lastUpdated = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

CREATE TRIGGER update_match_scores_timestamp
AFTER UPDATE ON match_scores
FOR EACH ROW
BEGIN
    UPDATE match_scores SET lastUpdated = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER validate_event_minute
BEFORE INSERT ON match_events
FOR EACH ROW
WHEN NEW.eventMinute < 0 OR NEW.eventMinute > 120
BEGIN
    SELECT RAISE(ABORT, 'Event minute must be between 0 and 120');
END;
    `;

    // ============================================================
    // 2. DATA INSERTS (all rows, including isodate for matches & bracket_rules)
    // ============================================================
    const TEAMS_INSERT = `INSERT INTO teams (id, code, name, flag) VALUES
(1, 'ALG', 'Algeria', 'https://api.fifa.com/api/v3/picture/flags-sq-1/ALG'),
(2, 'ARG', 'Argentina', 'https://api.fifa.com/api/v3/picture/flags-sq-1/ARG'),
(3, 'AUS', 'Australia', 'https://api.fifa.com/api/v3/picture/flags-sq-1/AUS'),
(4, 'AUT', 'Austria', 'https://api.fifa.com/api/v3/picture/flags-sq-1/AUT'),
(5, 'BEL', 'Belgium', 'https://api.fifa.com/api/v3/picture/flags-sq-1/BEL'),
(6, 'BIH', 'Bosnia and Herzegovina', 'https://api.fifa.com/api/v3/picture/flags-sq-1/BIH'),
(7, 'BRA', 'Brazil', 'https://api.fifa.com/api/v3/picture/flags-sq-1/BRA'),
(8, 'CPV', 'Cabo Verde', 'https://api.fifa.com/api/v3/picture/flags-sq-1/CPV'),
(9, 'CAN', 'Canada', 'https://api.fifa.com/api/v3/picture/flags-sq-1/CAN'),
(10, 'COL', 'Colombia', 'https://api.fifa.com/api/v3/picture/flags-sq-1/COL'),
(11, 'COD', 'Congo DR', 'https://api.fifa.com/api/v3/picture/flags-sq-1/COD'),
(12, 'CIV', 'Côte d''Ivoire', 'https://api.fifa.com/api/v3/picture/flags-sq-1/CIV'),
(13, 'CRO', 'Croatia', 'https://api.fifa.com/api/v3/picture/flags-sq-1/CRO'),
(14, 'CUW', 'Curaçao', 'https://api.fifa.com/api/v3/picture/flags-sq-1/CUW'),
(15, 'CZE', 'Czechia', 'https://api.fifa.com/api/v3/picture/flags-sq-1/CZE'),
(16, 'ECU', 'Ecuador', 'https://api.fifa.com/api/v3/picture/flags-sq-1/ECU'),
(17, 'EGY', 'Egypt', 'https://api.fifa.com/api/v3/picture/flags-sq-1/EGY'),
(18, 'ENG', 'England', 'https://api.fifa.com/api/v3/picture/flags-sq-1/ENG'),
(19, 'FRA', 'France', 'https://api.fifa.com/api/v3/picture/flags-sq-1/FRA'),
(20, 'GER', 'Germany', 'https://api.fifa.com/api/v3/picture/flags-sq-1/GER'),
(21, 'GHA', 'Ghana', 'https://api.fifa.com/api/v3/picture/flags-sq-1/GHA'),
(22, 'HAI', 'Haiti', 'https://api.fifa.com/api/v3/picture/flags-sq-1/HAI'),
(23, 'IRN', 'IR Iran', 'https://api.fifa.com/api/v3/picture/flags-sq-1/IRN'),
(24, 'IRQ', 'Iraq', 'https://api.fifa.com/api/v3/picture/flags-sq-1/IRQ'),
(25, 'JPN', 'Japan', 'https://api.fifa.com/api/v3/picture/flags-sq-1/JPN'),
(26, 'JOR', 'Jordan', 'https://api.fifa.com/api/v3/picture/flags-sq-1/JOR'),
(27, 'KOR', 'Korea Republic', 'https://api.fifa.com/api/v3/picture/flags-sq-1/KOR'),
(28, 'MEX', 'Mexico', 'https://api.fifa.com/api/v3/picture/flags-sq-1/MEX'),
(29, 'MAR', 'Morocco', 'https://api.fifa.com/api/v3/picture/flags-sq-1/MAR'),
(30, 'NED', 'Netherlands', 'https://api.fifa.com/api/v3/picture/flags-sq-1/NED'),
(31, 'NZL', 'New Zealand', 'https://api.fifa.com/api/v3/picture/flags-sq-1/NZL'),
(32, 'NOR', 'Norway', 'https://api.fifa.com/api/v3/picture/flags-sq-1/NOR'),
(33, 'PAN', 'Panama', 'https://api.fifa.com/api/v3/picture/flags-sq-1/PAN'),
(34, 'PAR', 'Paraguay', 'https://api.fifa.com/api/v3/picture/flags-sq-1/PAR'),
(35, 'POR', 'Portugal', 'https://api.fifa.com/api/v3/picture/flags-sq-1/POR'),
(36, 'QAT', 'Qatar', 'https://api.fifa.com/api/v3/picture/flags-sq-1/QAT'),
(37, 'KSA', 'Saudi Arabia', 'https://api.fifa.com/api/v3/picture/flags-sq-1/KSA'),
(38, 'SCO', 'Scotland', 'https://api.fifa.com/api/v3/picture/flags-sq-1/SCO'),
(39, 'SEN', 'Senegal', 'https://api.fifa.com/api/v3/picture/flags-sq-1/SEN'),
(40, 'RSA', 'South Africa', 'https://api.fifa.com/api/v3/picture/flags-sq-1/RSA'),
(41, 'ESP', 'Spain', 'https://api.fifa.com/api/v3/picture/flags-sq-1/ESP'),
(42, 'SWE', 'Sweden', 'https://api.fifa.com/api/v3/picture/flags-sq-1/SWE'),
(43, 'SUI', 'Switzerland', 'https://api.fifa.com/api/v3/picture/flags-sq-1/SUI'),
(44, 'TUN', 'Tunisia', 'https://api.fifa.com/api/v3/picture/flags-sq-1/TUN'),
(45, 'TUR', 'Türkiye', 'https://api.fifa.com/api/v3/picture/flags-sq-1/TUR'),
(46, 'URU', 'Uruguay', 'https://api.fifa.com/api/v3/picture/flags-sq-1/URU'),
(47, 'USA', 'USA', 'https://api.fifa.com/api/v3/picture/flags-sq-1/USA'),
(48, 'UZB', 'Uzbekistan', 'https://api.fifa.com/api/v3/picture/flags-sq-1/UZB');`;

    const GROUPS_INSERT = `INSERT INTO groups (id, name) VALUES
(1,'Group A'),(2,'Group B'),(3,'Group C'),(4,'Group D'),(5,'Group E'),
(6,'Group F'),(7,'Group G'),(8,'Group H'),(9,'Group I'),(10,'Group J'),
(11,'Group K'),(12,'Group L');`;

    const CITIES_INSERT = `INSERT INTO cities (id, name) VALUES
(1,'Mexico City'),(2,'Guadalajara'),(3,'Toronto'),(4,'Los Angeles'),
(5,'San Francisco Bay Area'),(6,'New Jersey'),(7,'Boston'),(8,'Vancouver'),
(9,'Houston'),(10,'Dallas'),(11,'Philadelphia'),(12,'Monterrey'),
(13,'Atlanta'),(14,'Seattle'),(15,'Miami'),(16,'Kansas City');`;

    const STADIUMS_INSERT = `INSERT INTO stadiums (id, name, cityId) VALUES
(1,'Mexico City Stadium',1),(2,'Guadalajara Stadium',2),(3,'Toronto Stadium',3),
(4,'Los Angeles Stadium',4),(5,'San Francisco Bay Area Stadium',5),
(6,'New York/New Jersey Stadium',6),(7,'Boston Stadium',7),(8,'BC Place Vancouver',8),
(9,'Houston Stadium',9),(10,'Dallas Stadium',10),(11,'Philadelphia Stadium',11),
(12,'Monterrey Stadium',12),(13,'Atlanta Stadium',13),(14,'Seattle Stadium',14),
(15,'Miami Stadium',15),(16,'Kansas City Stadium',16);`;

    const STAGES_INSERT = `INSERT INTO stages (id, name, "order") VALUES
(1,'First Stage',1),(2,'Round of 32',2),(3,'Round of 16',3),
(4,'Quarter-final',4),(5,'Semi-final',5),(6,'Play-off for third place',6),
(7,'Final',7);`;

    // matches INSERT includes isodate (computed from original date/time – local to UTC conversion)
    // These isodate values come directly from the matches.json provided earlier.
    const MATCHES_INSERT = `INSERT INTO matches (id, date, time, isodate, homeTeamId, awayTeamId, groupId, stageId, stadiumId, cityId) VALUES
(1,'Thursday 11 June 2026','22:00','2026-06-11T19:00:00.000Z',28,40,1,1,1,1),
(2,'Friday 12 June 2026','05:00','2026-06-12T02:00:00.000Z',27,15,1,1,2,2),
(3,'Friday 12 June 2026','22:00','2026-06-12T19:00:00.000Z',9,6,2,1,3,3),
(4,'Saturday 13 June 2026','04:00','2026-06-13T01:00:00.000Z',47,34,4,1,4,4),
(5,'Saturday 13 June 2026','22:00','2026-06-13T19:00:00.000Z',36,43,2,1,5,5),
(6,'Sunday 14 June 2026','01:00','2026-06-13T22:00:00.000Z',7,29,3,1,6,6),
(7,'Sunday 14 June 2026','04:00','2026-06-14T01:00:00.000Z',22,38,3,1,7,7),
(8,'Sunday 14 June 2026','07:00','2026-06-14T04:00:00.000Z',3,45,4,1,8,8),
(9,'Sunday 14 June 2026','20:00','2026-06-14T17:00:00.000Z',20,14,5,1,9,9),
(10,'Sunday 14 June 2026','23:00','2026-06-14T20:00:00.000Z',30,25,6,1,10,10),
(11,'Monday 15 June 2026','02:00','2026-06-14T23:00:00.000Z',12,16,5,1,11,11),
(12,'Monday 15 June 2026','05:00','2026-06-15T02:00:00.000Z',42,44,6,1,12,12),
(13,'Monday 15 June 2026','19:00','2026-06-15T16:00:00.000Z',41,8,8,1,13,13),
(14,'Monday 15 June 2026','22:00','2026-06-15T19:00:00.000Z',5,17,7,1,14,14),
(15,'Tuesday 16 June 2026','01:00','2026-06-15T22:00:00.000Z',37,46,8,1,15,15),
(16,'Tuesday 16 June 2026','04:00','2026-06-16T01:00:00.000Z',23,31,7,1,4,4),
(17,'Tuesday 16 June 2026','22:00','2026-06-16T19:00:00.000Z',19,39,9,1,6,6),
(18,'Wednesday 17 June 2026','01:00','2026-06-16T22:00:00.000Z',24,32,9,1,7,7),
(19,'Wednesday 17 June 2026','04:00','2026-06-17T01:00:00.000Z',2,1,10,1,16,16),
(20,'Wednesday 17 June 2026','07:00','2026-06-17T04:00:00.000Z',4,26,10,1,5,5),
(21,'Wednesday 17 June 2026','20:00','2026-06-17T17:00:00.000Z',35,11,11,1,9,9),
(22,'Wednesday 17 June 2026','23:00','2026-06-17T20:00:00.000Z',18,13,12,1,10,10),
(23,'Thursday 18 June 2026','02:00','2026-06-17T23:00:00.000Z',21,33,12,1,3,3),
(24,'Thursday 18 June 2026','05:00','2026-06-18T02:00:00.000Z',48,10,11,1,1,1),
(25,'Thursday 18 June 2026','19:00','2026-06-18T16:00:00.000Z',15,40,1,1,13,13),
(26,'Thursday 18 June 2026','22:00','2026-06-18T19:00:00.000Z',43,6,2,1,4,4),
(27,'Friday 19 June 2026','01:00','2026-06-18T22:00:00.000Z',9,36,2,1,8,8),
(28,'Friday 19 June 2026','04:00','2026-06-19T01:00:00.000Z',28,27,1,1,2,2),
(29,'Friday 19 June 2026','22:00','2026-06-19T19:00:00.000Z',47,3,4,1,14,14),
(30,'Saturday 20 June 2026','01:00','2026-06-19T22:00:00.000Z',38,29,3,1,7,7),
(31,'Saturday 20 June 2026','03:30','2026-06-20T00:30:00.000Z',7,22,3,1,11,11),
(32,'Saturday 20 June 2026','06:00','2026-06-20T03:00:00.000Z',45,34,4,1,5,5),
(33,'Saturday 20 June 2026','20:00','2026-06-20T17:00:00.000Z',30,42,6,1,9,9),
(34,'Saturday 20 June 2026','23:00','2026-06-20T20:00:00.000Z',20,12,5,1,3,3),
(35,'Sunday 21 June 2026','03:00','2026-06-21T00:00:00.000Z',16,14,5,1,16,16),
(36,'Sunday 21 June 2026','07:00','2026-06-21T04:00:00.000Z',44,25,6,1,12,12),
(37,'Sunday 21 June 2026','19:00','2026-06-21T16:00:00.000Z',41,37,8,1,13,13),
(38,'Sunday 21 June 2026','22:00','2026-06-21T19:00:00.000Z',5,23,7,1,4,4),
(39,'Monday 22 June 2026','01:00','2026-06-21T22:00:00.000Z',46,8,8,1,15,15),
(40,'Monday 22 June 2026','04:00','2026-06-22T01:00:00.000Z',31,17,7,1,8,8),
(41,'Monday 22 June 2026','20:00','2026-06-22T17:00:00.000Z',2,4,10,1,10,10),
(42,'Tuesday 23 June 2026','00:00','2026-06-22T21:00:00.000Z',19,24,9,1,11,11),
(43,'Tuesday 23 June 2026','03:00','2026-06-23T00:00:00.000Z',32,39,9,1,6,6),
(44,'Tuesday 23 June 2026','06:00','2026-06-23T03:00:00.000Z',26,1,10,1,5,5),
(45,'Tuesday 23 June 2026','20:00','2026-06-23T17:00:00.000Z',35,48,11,1,9,9),
(46,'Tuesday 23 June 2026','23:00','2026-06-23T20:00:00.000Z',18,21,12,1,7,7),
(47,'Wednesday 24 June 2026','02:00','2026-06-23T23:00:00.000Z',33,13,12,1,3,3),
(48,'Wednesday 24 June 2026','05:00','2026-06-24T02:00:00.000Z',10,11,11,1,2,2),
(49,'Wednesday 24 June 2026','22:00','2026-06-24T19:00:00.000Z',43,9,2,1,8,8),
(50,'Wednesday 24 June 2026','22:00','2026-06-24T19:00:00.000Z',6,36,2,1,14,14),
(51,'Thursday 25 June 2026','01:00','2026-06-24T22:00:00.000Z',38,7,3,1,15,15),
(52,'Thursday 25 June 2026','01:00','2026-06-24T22:00:00.000Z',29,22,3,1,13,13),
(53,'Thursday 25 June 2026','04:00','2026-06-25T01:00:00.000Z',15,28,1,1,1,1),
(54,'Thursday 25 June 2026','04:00','2026-06-25T01:00:00.000Z',40,27,1,1,12,12),
(55,'Thursday 25 June 2026','23:00','2026-06-25T20:00:00.000Z',14,12,5,1,11,11),
(56,'Thursday 25 June 2026','23:00','2026-06-25T20:00:00.000Z',16,20,5,1,6,6),
(57,'Friday 26 June 2026','02:00','2026-06-25T23:00:00.000Z',25,42,6,1,10,10),
(58,'Friday 26 June 2026','02:00','2026-06-25T23:00:00.000Z',44,30,6,1,16,16),
(59,'Friday 26 June 2026','05:00','2026-06-26T02:00:00.000Z',45,47,4,1,4,4),
(60,'Friday 26 June 2026','05:00','2026-06-26T02:00:00.000Z',34,3,4,1,5,5),
(61,'Friday 26 June 2026','22:00','2026-06-26T19:00:00.000Z',32,19,9,1,7,7),
(62,'Friday 26 June 2026','22:00','2026-06-26T19:00:00.000Z',39,24,9,1,3,3),
(63,'Saturday 27 June 2026','03:00','2026-06-27T00:00:00.000Z',8,37,8,1,9,9),
(64,'Saturday 27 June 2026','03:00','2026-06-27T00:00:00.000Z',46,41,8,1,2,2),
(65,'Saturday 27 June 2026','06:00','2026-06-27T03:00:00.000Z',17,23,7,1,14,14),
(66,'Saturday 27 June 2026','06:00','2026-06-27T03:00:00.000Z',31,5,7,1,8,8),
(67,'Sunday 28 June 2026','00:00','2026-06-27T21:00:00.000Z',33,18,12,1,6,6),
(68,'Sunday 28 June 2026','00:00','2026-06-27T21:00:00.000Z',13,21,12,1,11,11),
(69,'Sunday 28 June 2026','02:30','2026-06-27T23:30:00.000Z',10,35,11,1,15,15),
(70,'Sunday 28 June 2026','02:30','2026-06-27T23:30:00.000Z',11,48,11,1,13,13),
(71,'Sunday 28 June 2026','05:00','2026-06-28T02:00:00.000Z',1,4,10,1,16,16),
(72,'Sunday 28 June 2026','05:00','2026-06-28T02:00:00.000Z',26,2,10,1,10,10),
(73,'Sunday 28 June 2026','22:00','2026-06-28T19:00:00.000Z',NULL,NULL,NULL,2,4,4),
(74,'Monday 29 June 2026','20:00','2026-06-29T17:00:00.000Z',NULL,NULL,NULL,2,9,9),
(75,'Monday 29 June 2026','23:30','2026-06-29T20:30:00.000Z',NULL,NULL,NULL,2,7,7),
(76,'Tuesday 30 June 2026','04:00','2026-06-30T01:00:00.000Z',NULL,NULL,NULL,2,12,12),
(77,'Tuesday 30 June 2026','20:00','2026-06-30T17:00:00.000Z',NULL,NULL,NULL,2,10,10),
(78,'Wednesday 1 July 2026','00:00','2026-06-30T21:00:00.000Z',NULL,NULL,NULL,2,6,6),
(79,'Wednesday 1 July 2026','04:00','2026-07-01T01:00:00.000Z',NULL,NULL,NULL,2,1,1),
(80,'Wednesday 1 July 2026','19:00','2026-07-01T16:00:00.000Z',NULL,NULL,NULL,2,13,13),
(81,'Wednesday 1 July 2026','23:00','2026-07-01T20:00:00.000Z',NULL,NULL,NULL,2,14,14),
(82,'Thursday 2 July 2026','03:00','2026-07-02T00:00:00.000Z',NULL,NULL,NULL,2,5,5),
(83,'Thursday 2 July 2026','22:00','2026-07-02T19:00:00.000Z',NULL,NULL,NULL,2,4,4),
(84,'Friday 3 July 2026','02:00','2026-07-02T23:00:00.000Z',NULL,NULL,NULL,2,3,3),
(85,'Friday 3 July 2026','06:00','2026-07-03T03:00:00.000Z',NULL,NULL,NULL,2,8,8),
(86,'Friday 3 July 2026','21:00','2026-07-03T18:00:00.000Z',NULL,NULL,NULL,2,10,10),
(87,'Saturday 4 July 2026','01:00','2026-07-03T22:00:00.000Z',NULL,NULL,NULL,2,15,15),
(88,'Saturday 4 July 2026','04:30','2026-07-04T01:30:00.000Z',NULL,NULL,NULL,2,16,16),
(89,'Saturday 4 July 2026','20:00','2026-07-04T17:00:00.000Z',NULL,NULL,NULL,3,9,9),
(90,'Sunday 5 July 2026','00:00','2026-07-04T21:00:00.000Z',NULL,NULL,NULL,3,11,11),
(91,'Sunday 5 July 2026','23:00','2026-07-05T20:00:00.000Z',NULL,NULL,NULL,3,6,6),
(92,'Monday 6 July 2026','03:00','2026-07-06T00:00:00.000Z',NULL,NULL,NULL,3,1,1),
(93,'Monday 6 July 2026','22:00','2026-07-06T19:00:00.000Z',NULL,NULL,NULL,3,10,10),
(94,'Tuesday 7 July 2026','03:00','2026-07-07T00:00:00.000Z',NULL,NULL,NULL,3,14,14),
(95,'Tuesday 7 July 2026','19:00','2026-07-07T16:00:00.000Z',NULL,NULL,NULL,3,13,13),
(96,'Tuesday 7 July 2026','23:00','2026-07-07T20:00:00.000Z',NULL,NULL,NULL,3,8,8),
(97,'Thursday 9 July 2026','23:00','2026-07-09T20:00:00.000Z',NULL,NULL,NULL,4,7,7),
(98,'Friday 10 July 2026','22:00','2026-07-10T19:00:00.000Z',NULL,NULL,NULL,4,4,4),
(99,'Sunday 12 July 2026','00:00','2026-07-11T21:00:00.000Z',NULL,NULL,NULL,4,15,15),
(100,'Sunday 12 July 2026','04:00','2026-07-12T01:00:00.000Z',NULL,NULL,NULL,4,16,16),
(101,'Tuesday 14 July 2026','22:00','2026-07-14T19:00:00.000Z',NULL,NULL,NULL,5,10,10),
(102,'Wednesday 15 July 2026','22:00','2026-07-15T19:00:00.000Z',NULL,NULL,NULL,5,13,13),
(103,'Sunday 19 July 2026','00:00','2026-07-18T21:00:00.000Z',NULL,NULL,NULL,6,15,15),
(104,'Sunday 19 July 2026','22:00','2026-07-19T19:00:00.000Z',NULL,NULL,NULL,7,6,6);`;

    // bracket_rules INSERT includes isodate (taken from knockout.json – local to UTC conversion)
    // Note: stadiumId and cityId are looked up from matches table via matchNumber, but here we reuse the same values as matches.
    const BRACKET_RULES_INSERT = `INSERT INTO bracket_rules (matchNumber, stageId, date, time, isodate, stadiumId, cityId, homeRule, awayRule) VALUES
(73,2,'2026-06-28','22:00','2026-06-28T19:00:00.000Z',4,4,'2A','2B'),
(74,2,'2026-06-29','23:30','2026-06-29T20:30:00.000Z',9,9,'1E','3ABCDF'),
(75,2,'2026-06-30','04:00','2026-06-30T01:00:00.000Z',7,7,'1F','2C'),
(76,2,'2026-06-29','20:00','2026-06-29T17:00:00.000Z',12,12,'1C','2F'),
(77,2,'2026-07-01','00:00','2026-06-30T21:00:00.000Z',10,10,'1I','3CDFGH'),
(78,2,'2026-06-30','20:00','2026-06-30T17:00:00.000Z',6,6,'2E','2I'),
(79,2,'2026-07-01','04:00','2026-07-01T01:00:00.000Z',1,1,'1A','3CEFHI'),
(80,2,'2026-07-01','19:00','2026-07-01T16:00:00.000Z',13,13,'1L','3EHIJK'),
(81,2,'2026-07-02','03:00','2026-07-02T00:00:00.000Z',14,14,'1D','3BEFIJ'),
(82,2,'2026-07-01','23:00','2026-07-01T20:00:00.000Z',5,5,'1G','3AEHIJ'),
(83,2,'2026-07-03','02:00','2026-07-02T23:00:00.000Z',4,4,'2K','2L'),
(84,2,'2026-07-02','22:00','2026-07-02T19:00:00.000Z',3,3,'1H','2J'),
(85,2,'2026-07-03','06:00','2026-07-03T03:00:00.000Z',8,8,'1B','3EFGIJ'),
(86,2,'2026-07-04','01:00','2026-07-03T22:00:00.000Z',10,10,'1J','2H'),
(87,2,'2026-07-04','04:30','2026-07-04T01:30:00.000Z',15,15,'1K','3DEIJL'),
(88,2,'2026-07-03','21:00','2026-07-03T18:00:00.000Z',16,16,'2D','2G'),
(89,3,'2026-07-05','00:00','2026-07-04T21:00:00.000Z',9,9,'W74','W77'),
(90,3,'2026-07-04','20:00','2026-07-04T17:00:00.000Z',11,11,'W73','W75'),
(91,3,'2026-07-05','23:00','2026-07-05T20:00:00.000Z',6,6,'W76','W78'),
(92,3,'2026-07-06','03:00','2026-07-06T00:00:00.000Z',1,1,'W79','W80'),
(93,3,'2026-07-06','22:00','2026-07-06T19:00:00.000Z',10,10,'W83','W84'),
(94,3,'2026-07-07','03:00','2026-07-07T00:00:00.000Z',14,14,'W81','W82'),
(95,3,'2026-07-07','19:00','2026-07-07T16:00:00.000Z',13,13,'W86','W88'),
(96,3,'2026-07-07','23:00','2026-07-07T20:00:00.000Z',8,8,'W85','W87'),
(97,4,'2026-07-09','23:00','2026-07-09T20:00:00.000Z',7,7,'W89','W90'),
(98,4,'2026-07-10','22:00','2026-07-10T19:00:00.000Z',4,4,'W93','W94'),
(99,4,'2026-07-12','00:00','2026-07-11T21:00:00.000Z',15,15,'W91','W92'),
(100,4,'2026-07-12','04:00','2026-07-12T01:00:00.000Z',16,16,'W95','W96'),
(101,5,'2026-07-14','22:00','2026-07-14T19:00:00.000Z',10,10,'W97','W98'),
(102,5,'2026-07-15','22:00','2026-07-15T19:00:00.000Z',13,13,'W99','W100'),
(103,6,'2026-07-19','00:00','2026-07-18T21:00:00.000Z',15,15,'RU101','RU102'),
(104,7,'2026-07-19','22:00','2026-07-19T19:00:00.000Z',6,6,'W101','W102');`;

    const MATCH_SCORES_INSERT = `INSERT INTO match_scores (matchId, homeScoreFullTime, awayScoreFullTime, status)
SELECT id, 0, 0, 'scheduled' FROM matches;`;

    // ============================================================
    // 3. DATABASE CREATION FUNCTION
    // ============================================================
    async function createFIFA2026Database() {
        if (!window.JaferSQL) throw new Error('JaferSQL not loaded');
        const db = await window.JaferSQL.jaferInit();
        try {
            db.jaferExec(SCHEMA_SQL);
            db.jaferExec(TEAMS_INSERT);
            db.jaferExec(GROUPS_INSERT);
            db.jaferExec(CITIES_INSERT);
            db.jaferExec(STADIUMS_INSERT);
            db.jaferExec(STAGES_INSERT);
            db.jaferExec(MATCHES_INSERT);
            db.jaferExec(BRACKET_RULES_INSERT);
            db.jaferExec(MATCH_SCORES_INSERT);
            console.log('FIFA 2026 database created successfully with isodate columns and modern views.');
            return db;
        } catch (err) {
            console.error('Database creation failed:', err);
            db.jaferClose();
            throw err;
        }
    }

    function downloadDatabase(db, filename = 'WC2026.db') {
        const data = db.jaferExport();
        const blob = new Blob([data], { type: 'application/x-sqlite3' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Expose globally
    window.FIFA2026 = {
        create: createFIFA2026Database,
        download: downloadDatabase,
        SCHEMA: SCHEMA_SQL
    };

    // Optional: auto-attach to a button with id="createFifaBtn"
    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('createFifaBtn');
        if (btn) {
            btn.addEventListener('click', async () => {
                const db = await FIFA2026.create();
                FIFA2026.download(db);
                if (window.currentDb !== undefined) window.currentDb = db;
            });
        }
    });

    console.log('[new.js] FIFA 2026 database builder with isodate loaded. Use FIFA2026.create() to build, then FIFA2026.download(db).');
})();
