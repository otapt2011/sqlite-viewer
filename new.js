/**
 * new.js – FIFA 2026 SQLite Database Creator (Full Version)
 * Creates a complete database with tables, indexes, views, and all match data.
 * Dependencies: JaferSQL (must be loaded before this script)
 */
(function() {
    'use strict';

    // ============================================================
    // 1. COMPLETE SQL SCHEMA (all tables, indexes, and views)
    // ============================================================
    const SCHEMA_SQL = `
        -- Tables
        CREATE TABLE IF NOT EXISTS teams (
            id INTEGER PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            flag TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS stages (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            "order" INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS cities (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS stadiums (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            cityId INTEGER NOT NULL,
            FOREIGN KEY (cityId) REFERENCES cities(id)
        );

        CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
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

        CREATE TABLE IF NOT EXISTS match_scores (
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

        CREATE TABLE IF NOT EXISTS match_events (
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

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_matches_homeTeam ON matches(homeTeamId);
        CREATE INDEX IF NOT EXISTS idx_matches_awayTeam ON matches(awayTeamId);
        CREATE INDEX IF NOT EXISTS idx_matches_group ON matches(groupId);
        CREATE INDEX IF NOT EXISTS idx_matches_stage ON matches(stageId);
        CREATE INDEX IF NOT EXISTS idx_matches_stadium ON matches(stadiumId);
        CREATE INDEX IF NOT EXISTS idx_matches_city ON matches(cityId);
        CREATE INDEX IF NOT EXISTS idx_stadiums_city ON stadiums(cityId);
        CREATE INDEX IF NOT EXISTS idx_match_scores_match ON match_scores(matchId);
        CREATE INDEX IF NOT EXISTS idx_match_events_match ON match_events(matchId);
        CREATE INDEX IF NOT EXISTS idx_match_events_team ON match_events(teamId);
        CREATE INDEX IF NOT EXISTS idx_match_events_type ON match_events(eventType);

        -- Views
        CREATE VIEW IF NOT EXISTS group_standings_raw AS
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

        CREATE VIEW IF NOT EXISTS group_standings AS
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

        CREATE VIEW IF NOT EXISTS group_standings_simple AS
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

        CREATE VIEW IF NOT EXISTS match_details AS
        SELECT 
            m.id,
            m.date,
            m.time,
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
            ms.status AS matchStatus
        FROM matches m
        LEFT JOIN teams homeTeam ON m.homeTeamId = homeTeam.id
        LEFT JOIN teams awayTeam ON m.awayTeamId = awayTeam.id
        LEFT JOIN groups g ON m.groupId = g.id
        LEFT JOIN stages s ON m.stageId = s.id
        LEFT JOIN stadiums st ON m.stadiumId = st.id
        LEFT JOIN cities c ON m.cityId = c.id
        LEFT JOIN match_scores ms ON m.id = ms.matchId;

        CREATE VIEW IF NOT EXISTS upcoming_matches AS
        SELECT * FROM match_details
        WHERE matchStatus != 'finished'
          AND date >= date('now')
        ORDER BY date, time;

        CREATE VIEW IF NOT EXISTS finished_matches AS
        SELECT * FROM match_details
        WHERE matchStatus = 'finished'
        ORDER BY date DESC, time DESC;

        CREATE VIEW IF NOT EXISTS knockout_bracket AS
        SELECT 
            m.id,
            m.date,
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

        CREATE VIEW IF NOT EXISTS team_match_history AS
        SELECT 
            t.id AS teamId,
            t.name AS teamName,
            m.id AS matchId,
            m.date,
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
        ORDER BY t.id, m.date;

        CREATE VIEW IF NOT EXISTS top_scorers AS
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
        ORDER BY goals DESC;

        CREATE VIEW IF NOT EXISTS own_goals AS
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

        CREATE VIEW IF NOT EXISTS card_summary AS
        SELECT 
            t.id AS teamId,
            t.name AS teamName,
            SUM(CASE WHEN me.eventType = 'yellow_card' THEN 1 ELSE 0 END) AS yellowCards,
            SUM(CASE WHEN me.eventType = 'red_card' THEN 1 ELSE 0 END) AS redCards
        FROM match_events me
        JOIN teams t ON me.teamId = t.id
        GROUP BY me.teamId;

        CREATE VIEW IF NOT EXISTS match_events_details AS
        SELECT 
            m.id AS matchId,
            m.date,
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
        ORDER BY m.date, m.time, me.eventMinute, me.eventMinuteExtra;
    `;

    // ============================================================
    // 2. DATA INSERTS (full, no truncation)
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
(1, 'Group A'),(2,'Group B'),(3,'Group C'),(4,'Group D'),(5,'Group E'),
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

    const MATCHES_INSERT = `INSERT INTO matches (id, date, time, homeTeamId, awayTeamId, groupId, stageId, stadiumId, cityId) VALUES
(1,'Thursday 11 June 2026','22:00',28,40,1,1,1,1),
(2,'Friday 12 June 2026','05:00',27,15,1,1,2,2),
(3,'Friday 12 June 2026','22:00',9,6,2,1,3,3),
(4,'Saturday 13 June 2026','04:00',47,34,4,1,4,4),
(5,'Saturday 13 June 2026','22:00',36,43,2,1,5,5),
(6,'Sunday 14 June 2026','01:00',7,29,3,1,6,6),
(7,'Sunday 14 June 2026','04:00',22,38,3,1,7,7),
(8,'Sunday 14 June 2026','07:00',3,45,4,1,8,8),
(9,'Sunday 14 June 2026','20:00',20,14,5,1,9,9),
(10,'Sunday 14 June 2026','23:00',30,25,6,1,10,10),
(11,'Monday 15 June 2026','02:00',12,16,5,1,11,11),
(12,'Monday 15 June 2026','05:00',42,44,6,1,12,12),
(13,'Monday 15 June 2026','19:00',41,8,8,1,13,13),
(14,'Monday 15 June 2026','22:00',5,17,7,1,14,14),
(15,'Tuesday 16 June 2026','01:00',37,46,8,1,15,15),
(16,'Tuesday 16 June 2026','04:00',23,31,7,1,4,4),
(17,'Tuesday 16 June 2026','22:00',19,39,9,1,6,6),
(18,'Wednesday 17 June 2026','01:00',24,32,9,1,7,7),
(19,'Wednesday 17 June 2026','04:00',2,1,10,1,16,16),
(20,'Wednesday 17 June 2026','07:00',4,26,10,1,5,5),
(21,'Wednesday 17 June 2026','20:00',35,11,11,1,9,9),
(22,'Wednesday 17 June 2026','23:00',18,13,12,1,10,10),
(23,'Thursday 18 June 2026','02:00',21,33,12,1,3,3),
(24,'Thursday 18 June 2026','05:00',48,10,11,1,1,1),
(25,'Thursday 18 June 2026','19:00',15,40,1,1,13,13),
(26,'Thursday 18 June 2026','22:00',43,6,2,1,4,4),
(27,'Friday 19 June 2026','01:00',9,36,2,1,8,8),
(28,'Friday 19 June 2026','04:00',28,27,1,1,2,2),
(29,'Friday 19 June 2026','22:00',47,3,4,1,14,14),
(30,'Saturday 20 June 2026','01:00',38,29,3,1,7,7),
(31,'Saturday 20 June 2026','03:30',7,22,3,1,11,11),
(32,'Saturday 20 June 2026','06:00',45,34,4,1,5,5),
(33,'Saturday 20 June 2026','20:00',30,42,6,1,9,9),
(34,'Saturday 20 June 2026','23:00',20,12,5,1,3,3),
(35,'Sunday 21 June 2026','03:00',16,14,5,1,16,16),
(36,'Sunday 21 June 2026','07:00',44,25,6,1,12,12),
(37,'Sunday 21 June 2026','19:00',41,37,8,1,13,13),
(38,'Sunday 21 June 2026','22:00',5,23,7,1,4,4),
(39,'Monday 22 June 2026','01:00',46,8,8,1,15,15),
(40,'Monday 22 June 2026','04:00',31,17,7,1,8,8),
(41,'Monday 22 June 2026','20:00',2,4,10,1,10,10),
(42,'Tuesday 23 June 2026','00:00',19,24,9,1,11,11),
(43,'Tuesday 23 June 2026','03:00',32,39,9,1,6,6),
(44,'Tuesday 23 June 2026','06:00',26,1,10,1,5,5),
(45,'Tuesday 23 June 2026','20:00',35,48,11,1,9,9),
(46,'Tuesday 23 June 2026','23:00',18,21,12,1,7,7),
(47,'Wednesday 24 June 2026','02:00',33,13,12,1,3,3),
(48,'Wednesday 24 June 2026','05:00',10,11,11,1,2,2),
(49,'Wednesday 24 June 2026','22:00',43,9,2,1,8,8),
(50,'Wednesday 24 June 2026','22:00',6,36,2,1,14,14),
(51,'Thursday 25 June 2026','01:00',38,7,3,1,15,15),
(52,'Thursday 25 June 2026','01:00',29,22,3,1,13,13),
(53,'Thursday 25 June 2026','04:00',15,28,1,1,1,1),
(54,'Thursday 25 June 2026','04:00',40,27,1,1,12,12),
(55,'Thursday 25 June 2026','23:00',14,12,5,1,11,11),
(56,'Thursday 25 June 2026','23:00',16,20,5,1,6,6),
(57,'Friday 26 June 2026','02:00',25,42,6,1,10,10),
(58,'Friday 26 June 2026','02:00',44,30,6,1,16,16),
(59,'Friday 26 June 2026','05:00',45,47,4,1,4,4),
(60,'Friday 26 June 2026','05:00',34,3,4,1,5,5),
(61,'Friday 26 June 2026','22:00',32,19,9,1,7,7),
(62,'Friday 26 June 2026','22:00',39,24,9,1,3,3),
(63,'Saturday 27 June 2026','03:00',8,37,8,1,9,9),
(64,'Saturday 27 June 2026','03:00',46,41,8,1,2,2),
(65,'Saturday 27 June 2026','06:00',17,23,7,1,14,14),
(66,'Saturday 27 June 2026','06:00',31,5,7,1,8,8),
(67,'Sunday 28 June 2026','00:00',33,18,12,1,6,6),
(68,'Sunday 28 June 2026','00:00',13,21,12,1,11,11),
(69,'Sunday 28 June 2026','02:30',10,35,11,1,15,15),
(70,'Sunday 28 June 2026','02:30',11,48,11,1,13,13),
(71,'Sunday 28 June 2026','05:00',1,4,10,1,16,16),
(72,'Sunday 28 June 2026','05:00',26,2,10,1,10,10),
(73,'Sunday 28 June 2026','22:00',NULL,NULL,NULL,2,4,4),
(74,'Monday 29 June 2026','20:00',NULL,NULL,NULL,2,9,9),
(75,'Monday 29 June 2026','23:30',NULL,NULL,NULL,2,7,7),
(76,'Tuesday 30 June 2026','04:00',NULL,NULL,NULL,2,12,12),
(77,'Tuesday 30 June 2026','20:00',NULL,NULL,NULL,2,10,10),
(78,'Wednesday 1 July 2026','00:00',NULL,NULL,NULL,2,6,6),
(79,'Wednesday 1 July 2026','04:00',NULL,NULL,NULL,2,1,1),
(80,'Wednesday 1 July 2026','19:00',NULL,NULL,NULL,2,13,13),
(81,'Wednesday 1 July 2026','23:00',NULL,NULL,NULL,2,14,14),
(82,'Thursday 2 July 2026','03:00',NULL,NULL,NULL,2,5,5),
(83,'Thursday 2 July 2026','22:00',NULL,NULL,NULL,2,4,4),
(84,'Friday 3 July 2026','02:00',NULL,NULL,NULL,2,3,3),
(85,'Friday 3 July 2026','06:00',NULL,NULL,NULL,2,8,8),
(86,'Friday 3 July 2026','21:00',NULL,NULL,NULL,2,10,10),
(87,'Saturday 4 July 2026','01:00',NULL,NULL,NULL,2,15,15),
(88,'Saturday 4 July 2026','04:30',NULL,NULL,NULL,2,16,16),
(89,'Saturday 4 July 2026','20:00',NULL,NULL,NULL,3,9,9),
(90,'Sunday 5 July 2026','00:00',NULL,NULL,NULL,3,11,11),
(91,'Sunday 5 July 2026','23:00',NULL,NULL,NULL,3,6,6),
(92,'Monday 6 July 2026','03:00',NULL,NULL,NULL,3,1,1),
(93,'Monday 6 July 2026','22:00',NULL,NULL,NULL,3,10,10),
(94,'Tuesday 7 July 2026','03:00',NULL,NULL,NULL,3,14,14),
(95,'Tuesday 7 July 2026','19:00',NULL,NULL,NULL,3,13,13),
(96,'Tuesday 7 July 2026','23:00',NULL,NULL,NULL,3,8,8),
(97,'Thursday 9 July 2026','23:00',NULL,NULL,NULL,4,7,7),
(98,'Friday 10 July 2026','22:00',NULL,NULL,NULL,4,4,4),
(99,'Sunday 12 July 2026','00:00',NULL,NULL,NULL,4,15,15),
(100,'Sunday 12 July 2026','04:00',NULL,NULL,NULL,4,16,16),
(101,'Tuesday 14 July 2026','22:00',NULL,NULL,NULL,5,10,10),
(102,'Wednesday 15 July 2026','22:00',NULL,NULL,NULL,5,13,13),
(103,'Sunday 19 July 2026','00:00',NULL,NULL,NULL,6,15,15),
(104,'Sunday 19 July 2026','22:00',NULL,NULL,NULL,7,6,6);`;

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
        db.jaferExec(MATCH_SCORES_INSERT);
        console.log('FIFA 2026 database created successfully');
        return db;
    } catch (err) {
        console.error('Database creation failed:', err);
        db.jaferClose();
        throw err;
    }
}

    function downloadDatabase(db, filename = 'FIFA-2026.db') {
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
    
   // At the end of new.js, after defining FIFA2026
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('createFifaBtn');
    if (btn) {
        btn.addEventListener('click', async () => {
            const db = await FIFA2026.create();
            FIFA2026.download(db);
            // Optionally, you could also assign to window.currentDb if app.js expects it
            if (window.currentDb !== undefined) window.currentDb = db;
        });
    }
});

    console.log('[new.js] FIFA 2026 database builder loaded. Use FIFA2026.create() to build, then FIFA2026.download(db).');
})();
