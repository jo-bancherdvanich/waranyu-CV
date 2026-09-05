/* Football club database — runnable queries
 *
 * Four of the analytical queries from sql/03_analytical_queries.sql, computed
 * in the browser over the same sample data the Oracle script inserts. The SQL
 * shown beside each result is the real query from the repository; the JS below
 * reproduces its logic so a visitor can see the output without an Oracle box.
 */
(function () {
  "use strict";

  var root = document.getElementById("sql-demo");
  if (!root || !window.FOOTBALL_DATA) return;

  var D = window.FOOTBALL_DATA;

  /* ---- index the tables once, the way a join would -------------------- */
  var clubByID = {}, groundByID = {}, resultByID = {}, playerByID = {},
      gameByID = {}, gamePlayerByID = {}, bogByID = {};
  D.club.forEach(function (c) { clubByID[c.clubID] = c; });
  D.ground.forEach(function (g) { groundByID[g.groundID] = g; });
  D.result.forEach(function (r) { resultByID[r.resultID] = r; });
  D.player.forEach(function (p) { playerByID[p.playerID] = p; });
  D.game.forEach(function (g) { gameByID[g.gameID] = g; });
  D.gamePlayer.forEach(function (gp) { gamePlayerByID[gp.gamePlayerID] = gp; });
  D.bestOnGround.forEach(function (b) { bogByID[b.bogID] = b; });

  var fullName = function (p) { return p ? p.firstName + " " + p.lastName : "—"; };

  /* ---- Query 1: season ladder ----------------------------------------- */
  function ladder() {
    var acc = {};
    D.club.forEach(function (c) {
      acc[c.clubID] = { club: c.clubName, result: 0, bog: 0, goals: 0, home: 0, away: 0 };
    });
    D.clubGame.forEach(function (cg) {
      var a = acc[cg.clubID];
      if (!a) return;
      var res = resultByID[cg.resultID];
      if (res) a.result += res.points || 0;
      a.goals += cg.goalScored || 0;
      if (cg.resultID === "RS01") a.home++;
      if (cg.resultID === "RS02") a.away++;
    });
    D.bogPlayer.forEach(function (bp) {
      var gp = gamePlayerByID[bp.gamePlayerID];
      if (!gp) return;
      var pl = playerByID[gp.playerID];
      var bog = bogByID[bp.bogID];
      if (!pl || !bog || !acc[pl.clubID]) return;
      acc[pl.clubID].bog += bog.points || 0;
    });
    var rows = Object.keys(acc).map(function (k) {
      var a = acc[k];
      return [a.club, a.result, a.bog, a.goals, a.home, a.away, a.result + a.bog];
    });
    rows.sort(function (x, y) { return y[6] - x[6] || y[1] - x[1]; });
    return {
      cols: ["Club Name", "Result Points", "BOG Points", "Goals Scored", "Home Wins", "Away Wins", "Total Points"],
      rows: rows,
      note: "Every club appears even with no home wins, no away wins or no best-on-ground points — that is what the LEFT JOIN and COALESCE are protecting."
    };
  }

  /* ---- Query 2: top goal scorers -------------------------------------- */
  function topScorers() {
    var count = {};
    D.scoredGoal.forEach(function (sg) {
      var gp = gamePlayerByID[sg.gamePlayerID];
      if (!gp) return;
      count[gp.playerID] = (count[gp.playerID] || 0) + 1;
    });
    var rows = Object.keys(count).map(function (pid) {
      var p = playerByID[pid];
      var c = p ? clubByID[p.clubID] : null;
      return [fullName(p), c ? c.clubName : "—", count[pid]];
    });
    rows.sort(function (x, y) { return y[2] - x[2] || x[0].localeCompare(y[0]); });
    return {
      cols: ["Player", "Club", "Goals"],
      rows: rows.slice(0, 15),
      note: "154 goals across the season, grouped by the player behind each appearance. Showing the top 15."
    };
  }

  /* ---- Query 3: average goals per ground ------------------------------ */
  function goalsPerGround() {
    var games = {}, goals = {};
    D.game.forEach(function (g) {
      games[g.groundID] = (games[g.groundID] || 0) + 1;
      goals[g.groundID] = goals[g.groundID] || 0;
    });
    D.clubGame.forEach(function (cg) {
      var g = gameByID[cg.gameID];
      if (!g) return;
      goals[g.groundID] = (goals[g.groundID] || 0) + (cg.goalScored || 0);
    });
    var rows = D.ground.map(function (gr) {
      var played = games[gr.groundID] || 0;
      var scored = goals[gr.groundID] || 0;
      return [gr.name, played, scored, played ? (scored / played).toFixed(2) : "0.00"];
    });
    rows.sort(function (x, y) { return parseFloat(y[3]) - parseFloat(x[3]); });
    return {
      cols: ["Ground", "Games Played", "Goals", "Avg Goals / Game"],
      rows: rows,
      note: "A LEFT JOIN keeps goalless games in the denominator. An inner join would drop them and quietly inflate every average on this table."
    };
  }

  /* ---- Query 4: the top scorer's goals, one row per goal -------------- */
  function topScorerGoals() {
    var count = {};
    D.scoredGoal.forEach(function (sg) {
      var gp = gamePlayerByID[sg.gamePlayerID];
      if (gp) count[gp.playerID] = (count[gp.playerID] || 0) + 1;
    });
    var max = 0;
    Object.keys(count).forEach(function (k) { if (count[k] > max) max = count[k]; });
    var top = Object.keys(count).filter(function (k) { return count[k] === max; });

    var rows = [];
    D.scoredGoal.forEach(function (sg) {
      var gp = gamePlayerByID[sg.gamePlayerID];
      if (!gp || top.indexOf(gp.playerID) === -1) return;
      var g = gameByID[gp.gameID];
      var p = playerByID[gp.playerID];
      var own = p ? p.clubID : null;
      var sides = D.clubGame.filter(function (cg) { return cg.gameID === gp.gameID; });
      var opp = sides.filter(function (cg) { return cg.clubID !== own; })[0];
      rows.push([
        fullName(p),
        g ? g.gameDate : "—",
        opp && clubByID[opp.clubID] ? clubByID[opp.clubID].clubName : "—",
        g && groundByID[g.groundID] ? groundByID[g.groundID].name : "—",
        sg.gameMinute + "'"
      ]);
    });
    rows.sort(function (x, y) { return x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0; });
    return {
      cols: ["Player", "Date", "Opponent", "Ground", "Minute"],
      rows: rows,
      note: "The leading scorer is found with a HAVING subquery on MAX(total goals), not a hardcoded name — so this query still works next season."
    };
  }

  /* ---- the SQL shown beside each result ------------------------------- */
  var QUERIES = {
    ladder: {
      label: "Season ladder",
      question: "Who is top of the table, counting both result points and best-on-ground points?",
      run: ladder,
      sql:
"SELECT\n" +
"  cl.clubName AS \"Club Name\",\n" +
"  COALESCE(crs.total_result_points, 0) AS \"Result Points\",\n" +
"  COALESCE(bogp.total_bog_points, 0)   AS \"BOG Points\",\n" +
"  COALESCE(tgs.goals_scored_count, 0)  AS \"Goals Scored\",\n" +
"  COALESCE(hws.home_win_count, 0)      AS \"Home Wins\",\n" +
"  COALESCE(aws.away_win_count, 0)      AS \"Away Wins\",\n" +
"  COALESCE(crs.total_result_points, 0)\n" +
"    + COALESCE(bogp.total_bog_points, 0) AS \"Total Points\"\n" +
"FROM Club cl\n" +
"LEFT JOIN (\n" +
"  SELECT cg.clubID, SUM(rs.points) AS total_result_points\n" +
"  FROM ClubGame cg\n" +
"  JOIN Result rs ON rs.resultID = cg.resultID\n" +
"  GROUP BY cg.clubID\n" +
") crs ON crs.clubID = cl.clubID\n" +
"LEFT JOIN (\n" +
"  SELECT pl.clubID, SUM(bog.points) AS total_bog_points\n" +
"  FROM BogPlayer bp\n" +
"  JOIN BestOnGround bog ON bog.bogID = bp.bogID\n" +
"  JOIN GamePlayer gp    ON gp.gamePlayerID = bp.gamePlayerID\n" +
"  JOIN Player pl        ON pl.playerID = gp.playerID\n" +
"  GROUP BY pl.clubID\n" +
") bogp ON bogp.clubID = cl.clubID\n" +
"-- ... goals, home wins and away wins join the same way\n" +
"ORDER BY \"Total Points\" DESC, \"Result Points\" DESC;"
    },
    scorers: {
      label: "Top goal scorers",
      question: "Who scored the most goals this season, and for which club?",
      run: topScorers,
      sql:
"SELECT\n" +
"  pl.firstName || ' ' || pl.lastName AS \"Player\",\n" +
"  cl.clubName                        AS \"Club\",\n" +
"  COUNT(sg.gamePlayerID)             AS \"Goals\"\n" +
"FROM ScoredGoal sg\n" +
"JOIN GamePlayer gp ON gp.gamePlayerID = sg.gamePlayerID\n" +
"JOIN Player pl     ON pl.playerID     = gp.playerID\n" +
"JOIN Club cl       ON cl.clubID       = pl.clubID\n" +
"GROUP BY pl.firstName, pl.lastName, cl.clubName\n" +
"ORDER BY COUNT(sg.gamePlayerID) DESC;"
    },
    grounds: {
      label: "Goals per ground",
      question: "Which grounds produce the most goals per game?",
      run: goalsPerGround,
      sql:
"SELECT\n" +
"  grn.name                                      AS \"Ground\",\n" +
"  COUNT(DISTINCT gm.gameID)                     AS \"Games Played\",\n" +
"  COALESCE(SUM(cg.goalScored), 0)               AS \"Goals\",\n" +
"  ROUND(COALESCE(SUM(cg.goalScored), 0)\n" +
"        / NULLIF(COUNT(DISTINCT gm.gameID), 0), 2) AS \"Avg Goals / Game\"\n" +
"FROM Ground grn\n" +
"LEFT JOIN Game gm     ON gm.groundID = grn.groundID\n" +
"LEFT JOIN ClubGame cg ON cg.gameID   = gm.gameID\n" +
"GROUP BY grn.name\n" +
"ORDER BY 4 DESC;"
    },
    topgoals: {
      label: "Every goal by the top scorer",
      question: "Where and when did the leading scorer actually score?",
      run: topScorerGoals,
      sql:
"SELECT\n" +
"  pl.firstName || ' ' || pl.lastName AS \"Player\",\n" +
"  gm.gameDate                        AS \"Date\",\n" +
"  opp.clubName                       AS \"Opponent\",\n" +
"  grn.name                           AS \"Ground\",\n" +
"  sg.gameMinute                      AS \"Minute\"\n" +
"FROM ScoredGoal sg\n" +
"JOIN GamePlayer gp ON gp.gamePlayerID = sg.gamePlayerID\n" +
"JOIN Player pl     ON pl.playerID     = gp.playerID\n" +
"JOIN Game gm       ON gm.gameID       = gp.gameID\n" +
"JOIN Ground grn    ON grn.groundID    = gm.groundID\n" +
"JOIN ClubGame opp_cg ON opp_cg.gameID = gm.gameID\n" +
"                    AND opp_cg.clubID <> pl.clubID\n" +
"JOIN Club opp      ON opp.clubID      = opp_cg.clubID\n" +
"WHERE gp.playerID IN (\n" +
"  SELECT gp2.playerID\n" +
"  FROM ScoredGoal sg2\n" +
"  JOIN GamePlayer gp2 ON gp2.gamePlayerID = sg2.gamePlayerID\n" +
"  GROUP BY gp2.playerID\n" +
"  HAVING COUNT(sg2.goalID) = (\n" +
"    SELECT MAX(totalGoals) FROM (\n" +
"      SELECT COUNT(sg3.goalID) AS totalGoals\n" +
"      FROM ScoredGoal sg3\n" +
"      JOIN GamePlayer gp3 ON gp3.gamePlayerID = sg3.gamePlayerID\n" +
"      GROUP BY gp3.playerID))\n" +
")\n" +
"ORDER BY gm.gameDate, sg.gameMinute;"
    }
  };

  /* ---- rendering ------------------------------------------------------ */
  var els = {
    tabs: root.querySelectorAll(".sq-tab"),
    question: root.querySelector(".sq-question"),
    sql: root.querySelector(".sq-sql code"),
    table: root.querySelector(".sq-table"),
    note: root.querySelector(".sq-note"),
    count: root.querySelector(".sq-count")
  };

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function show(key) {
    var q = QUERIES[key];
    if (!q) return;
    var out = q.run();

    els.question.textContent = q.question;
    els.sql.textContent = q.sql;
    els.note.textContent = out.note;
    els.count.textContent = out.rows.length + (out.rows.length === 1 ? " row" : " rows");

    var head = "<tr>" + out.cols.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr>";
    var body = out.rows.map(function (r) {
      return "<tr>" + r.map(function (v, i) {
        return "<td" + (i === 0 ? "" : ' class="num"') + ">" + esc(v) + "</td>";
      }).join("") + "</tr>";
    }).join("");
    els.table.innerHTML = "<thead>" + head + "</thead><tbody>" + body + "</tbody>";

    els.tabs.forEach(function (t) {
      var on = t.dataset.query === key;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  els.tabs.forEach(function (t) {
    t.addEventListener("click", function () { show(t.dataset.query); });
  });

  show("ladder");
})();
