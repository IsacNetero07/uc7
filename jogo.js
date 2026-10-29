(function () {
    "use strict";
    const $ = function (selector) { return document.querySelector(selector); };
    const FILES = "abcdefgh";
    const HISTORY_KEY = "chessup_matches_v1";
    const NAMES_KEY = "chessup_player_names_v1";
    const MODES = {
        rapid: { label: "Rápida", seconds: 600 },
        blitz: { label: "Blitz", seconds: 300 },
        bullet: { label: "Bullet", seconds: 60 }
    };
    const GLYPHS = {
        w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
        b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" }
    };
    const PIECE_NAMES = {
        w: { k: "rei branco", q: "dama branca", r: "torre branca", b: "bispo branco", n: "cavalo branco", p: "peão branco" },
        b: { k: "rei preto", q: "dama preta", r: "torre preta", b: "bispo preto", n: "cavalo preto", p: "peão preto" }
    };
    const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    const boardElement = $("#chessboard");
    const boardMessage = $("#board-message");
    const gameStatus = $("#game-status");
    const whiteClock = $("#white-clock");
    const blackClock = $("#black-clock");
    const whiteInput = $("#white-player");
    const blackInput = $("#black-player");
    const whiteNameDisplay = $("#white-player-name");
    const blackNameDisplay = $("#black-player-name");
    const whiteBar = $("#white-player-bar");
    const blackBar = $("#black-player-bar");

    let chess = typeof window.Chess === "function" ? new window.Chess() : null;
    let mode = "rapid";
    let opponent = "local";
    let secondsPerSide = MODES[mode].seconds;
    let remaining = { w: secondsPerSide, b: secondsPerSide };
    let selected = null;
    let legalMoves = [];
    let flipped = false;
    let lastMove = null;
    let clockStarted = false;
    let timer = null;
    let finished = false;
    let computerThinking = false;
    let history = readJSON(HISTORY_KEY, []);
    if (!Array.isArray(history)) history = [];

    function readJSON(key, fallback) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : fallback;
        } catch (error) {
            return fallback;
        }
    }
    function writeJSON(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { /* armazenamento opcional */ }
    }
    function nameFor(color) {
        if (color === "b" && opponent === "computer") return "Computador";
        const field = color === "w" ? whiteInput : blackInput;
        return field.value.trim() || (color === "w" ? "Jogador 1" : "Jogador 2");
    }
    function restoreNames() {
        const saved = readJSON(NAMES_KEY, null);
        if (saved && typeof saved === "object") {
            if (typeof saved.white === "string") whiteInput.value = saved.white;
            if (typeof saved.black === "string") blackInput.value = saved.black;
        }
    }
    function saveNames() { writeJSON(NAMES_KEY, { white: whiteInput.value, black: blackInput.value }); }
    function updateNames() {
        whiteNameDisplay.textContent = nameFor("w") + " · Brancas";
        blackNameDisplay.textContent = nameFor("b") + " · Pretas";
        blackInput.disabled = opponent === "computer";
    }
    function fmtTime(seconds) {
        seconds = Math.max(0, Math.floor(seconds));
        return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
    }
    function updateClocks() {
        whiteClock.textContent = fmtTime(remaining.w);
        blackClock.textContent = fmtTime(remaining.b);
        whiteBar.classList.toggle("active-player", !!chess && !finished && chess.turn() === "w");
        blackBar.classList.toggle("active-player", !!chess && !finished && chess.turn() === "b");
        whiteClock.classList.toggle("clock-low", remaining.w <= 30);
        blackClock.classList.toggle("clock-low", remaining.b <= 30);
    }
    function updateCoordinates() {
        const ranks = $("#board-ranks");
        const files = $("#board-files");
        ranks.innerHTML = "";
        files.innerHTML = "";
        for (let r = 0; r < 8; r++) {
            const span = document.createElement("span");
            span.textContent = String(flipped ? r + 1 : 8 - r);
            ranks.appendChild(span);
        }
        files.appendChild(document.createElement("span"));
        for (let c = 0; c < 8; c++) {
            const span = document.createElement("span");
            span.textContent = FILES[flipped ? 7 - c : c];
            files.appendChild(span);
        }
    }
    function kingInCheckSquare() {
        if (!chess || !chess.in_check()) return null;
        const rows = chess.board();
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
            const piece = rows[r][c];
            if (piece && piece.type === "k" && piece.color === chess.turn()) return FILES[c] + String(8 - r);
        }
        return null;
    }
    function renderBoard() {
        if (!chess) return;
        const rows = chess.board();
        const checked = kingInCheckSquare();
        boardElement.innerHTML = "";
        for (let dr = 0; dr < 8; dr++) for (let dc = 0; dc < 8; dc++) {
            const r = flipped ? 7 - dr : dr;
            const c = flipped ? 7 - dc : dc;
            const square = FILES[c] + String(8 - r);
            const piece = rows[r][c];
            const button = document.createElement("button");
            button.type = "button";
            button.className = "square " + ((r + c) % 2 === 0 ? "square-light" : "square-dark");
            button.dataset.square = square;
            button.setAttribute("aria-pressed", selected === square ? "true" : "false");
            button.setAttribute("aria-label", square + ", " + (piece ? PIECE_NAMES[piece.color][piece.type] : "casa vazia"));
            if (piece) {
                button.textContent = GLYPHS[piece.color][piece.type];
                button.classList.add(piece.color === "w" ? "piece-white" : "piece-black");
            }
            if (selected === square) button.classList.add("selected");
            const possible = legalMoves.find(function (move) { return move.to === square; });
            if (possible) {
                button.classList.add("legal-target");
                if (possible.flags.indexOf("c") >= 0 || possible.flags.indexOf("e") >= 0) button.classList.add("capture-target");
            }
            if (lastMove && (lastMove.from === square || lastMove.to === square)) button.classList.add("last-move");
            if (checked === square) button.classList.add("in-check");
            button.disabled = finished || computerThinking;
            button.addEventListener("click", function () { onSquare(square); });
            boardElement.appendChild(button);
        }
        updateCoordinates();
        updateClocks();
    }
    function renderMoves() {
        const list = $("#move-list");
        const moves = chess ? chess.history() : [];
        list.innerHTML = "";
        if (!moves.length) {
            const li = document.createElement("li");
            li.className = "muted-item";
            li.textContent = "Nenhum movimento ainda.";
            list.appendChild(li);
            return;
        }
        for (let i = 0; i < moves.length; i += 2) {
            const li = document.createElement("li");
            li.className = "move-pair";
            const number = document.createElement("span");
            number.className = "move-number";
            number.textContent = String(Math.floor(i / 2) + 1) + ".";
            const white = document.createElement("span");
            white.textContent = moves[i];
            const black = document.createElement("span");
            black.textContent = moves[i + 1] || "…";
            li.append(number, white, black);
            list.appendChild(li);
        }
    }
    function updateControls() {
        const count = chess ? chess.history().length : 0;
        $("#undo-move").disabled = !chess || count === 0 || finished || computerThinking;
        $("#resign-game").disabled = !chess || count === 0 || finished || computerThinking;
        $("#export-pgn").disabled = !chess || count === 0;
        $("#new-game").disabled = !chess;
    }
    function updateStatus() {
        if (!chess || finished) return;
        gameStatus.textContent = clockStarted ? "Em andamento" : "Preparado";
        gameStatus.classList.remove("is-finished");
        if (computerThinking) {
            boardMessage.textContent = "O computador está pensando...";
            return;
        }
        const color = chess.turn();
        const label = nameFor(color) + (color === "w" ? " (brancas)" : " (pretas)");
        boardMessage.textContent = (chess.history().length ? "Vez de " + label + "." : "Brancas começam. Selecione uma peça e depois uma casa de destino.") + (chess.in_check() ? " Xeque!" : "");
    }
    function updateAll() {
        renderBoard();
        renderMoves();
        updateNames();
        updateStatus();
        updateControls();
        updateClocks();
    }
    function stopTimer() {
        if (timer !== null) {
            window.clearInterval(timer);
            timer = null;
        }
    }
    function startTimer() {
        if (clockStarted || finished) return;
        clockStarted = true;
        timer = window.setInterval(function () {
            if (!chess || finished) return;
            const active = chess.turn();
            remaining[active] -= 1;
            if (remaining[active] <= 0) {
                remaining[active] = 0;
                finishMatch(active === "w" ? "b" : "w", "Tempo esgotado");
            } else {
                updateClocks();
            }
        }, 1000);
    }
    function saveMatch(winner, reason) {
        const outcome = winner === "w" ? "Vitória das brancas" : winner === "b" ? "Vitória das pretas" : "Empate";
        history.unshift({
            id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 7),
            playedAt: new Date().toISOString(),
            mode: MODES[mode].label,
            opponent: opponent,
            white: nameFor("w"),
            black: nameFor("b"),
            winner: winner,
            outcome: outcome,
            reason: reason,
            result: winner === "w" ? "1-0" : winner === "b" ? "0-1" : "1/2-1/2",
            moves: chess.history().join(" "),
            pgn: chess.pgn()
        });
        history = history.slice(0, 50);
        writeJSON(HISTORY_KEY, history);
        renderHistory();
        updateStats();
    }
    function finishMatch(winner, reason) {
        if (finished) return;
        finished = true;
        computerThinking = false;
        stopTimer();
        selected = null;
        legalMoves = [];
        gameStatus.textContent = "Finalizada";
        gameStatus.classList.add("is-finished");
        const outcome = winner === "w" ? "Vitória das brancas" : winner === "b" ? "Vitória das pretas" : "Empate";
        boardMessage.textContent = outcome + " — " + reason + ".";
        if (chess && chess.history().length) saveMatch(winner, reason);
        updateAll();
    }
    function checkEnd() {
        if (!chess || finished) return true;
        if (chess.in_checkmate()) {
            finishMatch(chess.turn() === "w" ? "b" : "w", "Xeque-mate");
            return true;
        }
        if (chess.in_stalemate()) {
            finishMatch("d", "Afogamento");
            return true;
        }
        if (typeof chess.in_threefold_repetition === "function" && chess.in_threefold_repetition()) {
            finishMatch("d", "Repetição tripla");
            return true;
        }
        if (chess.in_draw()) {
            finishMatch("d", "Empate pelas regras do xadrez");
            return true;
        }
        return false;
    }
    function choosePiece(square, piece) {
        selected = square;
        legalMoves = chess.moves({ square: square, verbose: true });
        startTimer();
        boardMessage.textContent = "Peça selecionada: " + PIECE_NAMES[piece.color][piece.type] + ". Escolha uma casa destacada.";
        updateAll();
    }
    function onSquare(square) {
        if (!chess || finished || computerThinking) return;
        const piece = chess.get(square);
        if (selected !== null) {
            if (square === selected) {
                selected = null;
                legalMoves = [];
                boardMessage.textContent = "Seleção cancelada.";
                updateAll();
                return;
            }
            if (legalMoves.some(function (move) { return move.to === square; })) {
                makeMove(selected, square);
                return;
            }
            if (piece && piece.color === chess.turn()) {
                choosePiece(square, piece);
                return;
            }
            selected = null;
            legalMoves = [];
            boardMessage.textContent = "Movimento inválido. Escolha uma casa destacada ou outra peça da sua cor.";
            updateAll();
            return;
        }
        if (!piece) {
            boardMessage.textContent = "Selecione uma casa que contenha uma peça sua.";
            return;
        }
        if (piece.color !== chess.turn()) {
            boardMessage.textContent = "Ainda não é a vez dessa cor.";
            return;
        }
        choosePiece(square, piece);
    }
    function makeMove(from, to) {
        const movingPiece = chess.get(from);
        let moveMade = null;
        try {
            moveMade = chess.move({ from: from, to: to, promotion: "q" });
        } catch (error) {
            moveMade = null;
        }
        if (!moveMade) {
            selected = null;
            legalMoves = [];
            boardMessage.textContent = "Esse movimento não é permitido pelas regras do xadrez.";
            updateAll();
            return;
        }
        lastMove = { from: moveMade.from, to: moveMade.to };
        selected = null;
        legalMoves = [];
        startTimer();
        if (movingPiece && movingPiece.type === "p" && ((movingPiece.color === "w" && to.endsWith("8")) || (movingPiece.color === "b" && to.endsWith("1")))) {
            boardMessage.textContent = "Peão promovido a dama. Movimento: " + moveMade.san + ".";
        } else {
            boardMessage.textContent = "Movimento realizado: " + moveMade.san + ".";
        }
        if (checkEnd()) { updateAll(); return; }
        updateAll();
        if (opponent === "computer" && chess.turn() === "b") makeComputerMove();
    }
    function makeComputerMove() {
        if (!chess || finished || chess.turn() !== "b") return;
        computerThinking = true;
        updateAll();
        window.setTimeout(function () {
            if (finished || !chess || remaining.b <= 0) return;
            const moves = chess.moves({ verbose: true });
            if (!moves.length) {
                computerThinking = false;
                checkEnd();
                updateAll();
                return;
            }
            let bestScore = -Infinity;
            let best = [];
            moves.forEach(function (move) {
                let score = Math.random();
                const captured = chess.get(move.to);
                if (captured) score += (VALUES[captured.type] || 0) * 10;
                if (move.flags.indexOf("e") >= 0) score += 10;
                if (move.flags.indexOf("p") >= 0) score += 80;
                try {
                    const simulation = new window.Chess(chess.fen());
                    simulation.move(move.san);
                    if (simulation.in_checkmate()) score += 10000;
                    else if (simulation.in_check()) score += 3;
                } catch (error) { /* usa a jogada legal */ }
                if (score > bestScore) { bestScore = score; best = [move]; }
                else if (score === bestScore) best.push(move);
            });
            if (finished || !best.length) {
                computerThinking = false;
                updateAll();
                return;
            }
            const choice = best[Math.floor(Math.random() * best.length)];
            computerThinking = false;
            let made = null;
            try { made = chess.move(choice.san); } catch (error) { made = null; }
            if (made) {
                lastMove = { from: made.from, to: made.to };
                selected = null;
                legalMoves = [];
                boardMessage.textContent = "O computador jogou " + made.san + ".";
            }
            if (checkEnd()) { updateAll(); return; }
            updateAll();
        }, 350);
    }
    function canDiscard() {
        if (chess && !finished && chess.history().length) {
            return window.confirm("A partida atual ainda não terminou. Deseja descartá-la e começar outra?");
        }
        return true;
    }
    function newGame() {
        if (!chess) return;
        stopTimer();
        chess.reset();
        selected = null;
        legalMoves = [];
        flipped = false;
        lastMove = null;
        clockStarted = false;
        finished = false;
        computerThinking = false;
        remaining = { w: secondsPerSide, b: secondsPerSide };
        gameStatus.classList.remove("is-finished");
        gameStatus.textContent = "Preparado";
        boardMessage.textContent = "Brancas começam. Selecione uma peça e depois uma casa de destino.";
        updateAll();
    }
    function undoMove() {
        if (!chess || finished || computerThinking || !chess.history().length) return;
        const amount = opponent === "computer" && chess.history().length >= 2 ? 2 : 1;
        for (let i = 0; i < amount; i++) chess.undo();
        const hist = chess.history({ verbose: true });
        const prev = hist.length ? hist[hist.length - 1] : null;
        lastMove = prev ? { from: prev.from, to: prev.to } : null;
        selected = null;
        legalMoves = [];
        boardMessage.textContent = "Última jogada desfeita.";
        updateAll();
    }
    function renderHistory() {
        const list = $("#match-history");
        const empty = $("#empty-history");
        list.innerHTML = "";
        empty.hidden = history.length > 0;
        history.slice(0, 10).forEach(function (record) {
            const li = document.createElement("li");
            li.className = "history-item";
            const main = document.createElement("div");
            main.className = "history-item-main";
            const title = document.createElement("strong");
            title.textContent = record.outcome || "Partida finalizada";
            const details = document.createElement("p");
            const d = new Date(record.playedAt);
            const date = isNaN(d.getTime()) ? "Data indisponível" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
            details.textContent = date + " · " + (record.mode || "Xadrez") + " · " + (record.white || "Brancas") + " x " + (record.black || "Pretas");
            const reason = document.createElement("span");
            reason.className = "history-reason";
            reason.textContent = (record.reason || "Finalizada") + " · Resultado " + (record.result || "—");
            main.append(title, details, reason);
            const count = document.createElement("span");
            count.className = "history-move-count";
            const moves = (record.moves || "").trim();
            const n = moves ? moves.split(/\s+/).filter(Boolean).length : 0;
            count.textContent = n + (n === 1 ? " lance" : " lances");
            li.append(main, count);
            list.appendChild(li);
        });
    }
    function updateStats() {
        $("#stat-total").textContent = String(history.length);
        $("#stat-white").textContent = String(history.filter(function (item) { return item.winner === "w"; }).length);
        $("#stat-draws").textContent = String(history.filter(function (item) { return item.winner === "d"; }).length);
    }
    function exportPGN() {
        if (!chess || !chess.history().length) return;
        const content = "[Chess Up] " + nameFor("w") + " x " + nameFor("b") + "\n[Mode \"" + MODES[mode].label + "\"]\n\n" + chess.pgn();
        const blob = new Blob([content], { type: "application/x-chess-pgn;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "partida-chessup.pgn";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
    function initGame() {
        if (!chess) {
            gameStatus.textContent = "Motor indisponível";
            boardMessage.textContent = "Não foi possível carregar as regras do xadrez. Confira a conexão e atualize a página.";
            $("#new-game").disabled = true;
            document.querySelectorAll(".mode-option, .opponent-option").forEach(function (button) { button.disabled = true; });
            return;
        }
        restoreNames();
        const savedMode = readJSON("chessup_mode_v1", null);
        if (savedMode && MODES[savedMode]) mode = savedMode;
        secondsPerSide = MODES[mode].seconds;
        remaining = { w: secondsPerSide, b: secondsPerSide };
        document.querySelectorAll(".mode-option").forEach(function (button) {
            const active = button.dataset.mode === mode;
            button.classList.toggle("is-selected", active);
            button.setAttribute("aria-pressed", active ? "true" : "false");
            button.addEventListener("click", function () {
                if (!canDiscard()) return;
                mode = button.dataset.mode;
                secondsPerSide = MODES[mode].seconds;
                writeJSON("chessup_mode_v1", mode);
                document.querySelectorAll(".mode-option").forEach(function (other) {
                    const isActive = other === button;
                    other.classList.toggle("is-selected", isActive);
                    other.setAttribute("aria-pressed", isActive ? "true" : "false");
                });
                newGame();
            });
        });
        document.querySelectorAll(".opponent-option").forEach(function (button) {
            button.addEventListener("click", function () {
                if (!canDiscard()) return;
                opponent = button.dataset.opponent;
                document.querySelectorAll(".opponent-option").forEach(function (other) {
                    const active = other === button;
                    other.classList.toggle("is-selected", active);
                    other.setAttribute("aria-pressed", active ? "true" : "false");
                });
                newGame();
            });
        });
        whiteInput.addEventListener("input", function () { updateNames(); saveNames(); });
        blackInput.addEventListener("input", function () { updateNames(); saveNames(); });
        $("#new-game").addEventListener("click", function () { if (canDiscard()) newGame(); });
        $("#undo-move").addEventListener("click", undoMove);
        $("#flip-board").addEventListener("click", function () { flipped = !flipped; renderBoard(); });
        $("#resign-game").addEventListener("click", function () {
            if (!chess || finished || !chess.history().length) return;
            if (window.confirm("Deseja desistir desta partida?")) finishMatch(chess.turn() === "w" ? "b" : "w", "Desistência");
        });
        $("#export-pgn").addEventListener("click", exportPGN);
        $("#clear-history").addEventListener("click", function () {
            if (!history.length || !window.confirm("Apagar o histórico salvo neste navegador?")) return;
            history = [];
            writeJSON(HISTORY_KEY, history);
            renderHistory();
            updateStats();
        });
        updateNames();
        renderBoard();
        renderMoves();
        renderHistory();
        updateStats();
        updateStatus();
        updateControls();
    }

    const QUESTIONS = [
        { question: "Qual peça se movimenta em formato de L?", choices: ["Torre", "Cavalo", "Bispo", "Peão"], answer: 1, explanation: "O cavalo anda duas casas em uma direção e uma casa perpendicular. Ele pode saltar sobre outras peças." },
        { question: "Qual peça pode mover-se na horizontal, vertical e diagonal?", choices: ["Rei", "Torre", "Dama", "Cavalo"], answer: 2, explanation: "A dama combina os movimentos da torre e do bispo, mas não pode saltar sobre outras peças." },
        { question: "O que acontece no xeque-mate?", choices: ["O rei está ameaçado e não há jogada legal para escapar", "A dama é capturada", "Um jogador perde a torre", "O rei pode ser capturado na próxima jogada"], answer: 0, explanation: "O rei nunca é capturado. O xeque-mate ocorre quando ele está em xeque e não existe movimento legal que elimine a ameaça." }
    ];
    let questionIndex = 0;
    let quizScore = 0;
    let answered = false;
    let quizComplete = false;
    function renderQuestion() {
        const question = QUESTIONS[questionIndex];
        $("#quiz-question").textContent = question.question;
        $("#quiz-progress").textContent = "Pergunta " + (questionIndex + 1) + " de " + QUESTIONS.length;
        $("#quiz-options").innerHTML = "";
        $("#quiz-feedback").textContent = "Escolha uma resposta para continuar.";
        $("#quiz-next").disabled = true;
        $("#quiz-next").textContent = questionIndex === QUESTIONS.length - 1 ? "Ver resultado" : "Próxima pergunta";
        answered = false;
        question.choices.forEach(function (choice, index) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "quiz-option";
            button.textContent = choice;
            button.addEventListener("click", function () {
                if (answered) return;
                answered = true;
                const correct = index === question.answer;
                if (correct) {
                    quizScore += 1;
                    button.classList.add("correct");
                } else button.classList.add("wrong");
                $("#quiz-options").querySelectorAll("button").forEach(function (option, i) {
                    option.disabled = true;
                    if (i === question.answer) option.classList.add("correct");
                });
                $("#quiz-feedback").textContent = (correct ? "Correto! " : "Ainda não. ") + question.explanation;
                $("#quiz-score").textContent = "Acertos nesta sessão: " + quizScore;
                $("#quiz-next").disabled = false;
            });
            $("#quiz-options").appendChild(button);
        });
    }
    function initQuiz() {
        $("#quiz-next").addEventListener("click", function () {
            if (quizComplete) {
                quizComplete = false;
                questionIndex = 0;
                quizScore = 0;
                $("#quiz-score").textContent = "Acertos nesta sessão: 0";
                renderQuestion();
                return;
            }
            if (!answered) return;
            if (questionIndex === QUESTIONS.length - 1) {
                quizComplete = true;
                $("#quiz-feedback").textContent = "Você concluiu os desafios: " + quizScore + " de " + QUESTIONS.length + " acertos.";
                $("#quiz-next").textContent = "Jogar novamente";
                $("#quiz-next").disabled = false;
                $("#quiz-options").querySelectorAll("button").forEach(function (button) {
                    button.disabled = true;
                });
                return;
            }
            questionIndex += 1;
            renderQuestion();
        });
        renderQuestion();
    }

    initGame();
    initQuiz();
}());