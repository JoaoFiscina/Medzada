const SAMPLE_DATA = {
  entries: [
    { code: "A1", word: "ABACATE", clue: "Fruta verde e cremosa" },
    { code: "B2", word: "BANANA", clue: "Fruta amarela muito popular" },
    { code: "C3", word: "CACAU", clue: "Ingrediente base do chocolate" },
    { code: "D4", word: "DAMASCO", clue: "Fruta pequena de tom alaranjado" },
    { code: "E5", word: "FIGO", clue: "Fruta doce citada em sobremesas" },
    { code: "F6", word: "GOIABA", clue: "Fruta comum em doces e geleias" },
    { code: "G7", word: "LARANJA", clue: "Fruta cítrica rica em vitamina C" },
    { code: "H8", word: "MANGA", clue: "Fruta tropical muito consumida no Brasil" }
  ]
};

const state = {
  entries: [],
  placement: null,
  cellMap: new Map(),
  engineReady: false
};

const fileInput = document.querySelector("#fileInput");
const manualInput = document.querySelector("#manualInput");
const generateButton = document.querySelector("#generateButton");
const loadSampleButton = document.querySelector("#loadSampleButton");
const checkButton = document.querySelector("#checkButton");
const revealButton = document.querySelector("#revealButton");
const statusMessage = document.querySelector("#statusMessage");
const board = document.querySelector("#board");
const boardMeta = document.querySelector("#boardMeta");
const acrossClues = document.querySelector("#acrossClues");
const downClues = document.querySelector("#downClues");

fileInput.addEventListener("change", handleFileImport);
generateButton.addEventListener("click", handleGenerate);
loadSampleButton.addEventListener("click", () => {
  manualInput.value = JSON.stringify(SAMPLE_DATA, null, 2);
  setStatus("Exemplo carregado. Clique em gerar para montar o tabuleiro.", "success");
});
checkButton.addEventListener("click", checkAnswers);
revealButton.addEventListener("click", revealAnswers);

boot();

function boot() {
  try {
    runSelfCheck();
    state.engineReady = true;
    setStatus("Motor validado no carregamento. Importe os dados para gerar um jogo.", "success");
  } catch (error) {
    state.engineReady = false;
    generateButton.disabled = true;
    setStatus(`Falha na validacao interna: ${error.message}`, "danger");
  }
}

async function handleFileImport(event) {
  const [file] = event.target.files;
  if (!file) {
    return;
  }

  try {
    const content = await file.text();
    manualInput.value = content;
    setStatus(`Arquivo "${file.name}" carregado. Agora gere as palavras cruzadas.`, "success");
  } catch (error) {
    setStatus(`Nao foi possivel ler o arquivo: ${error.message}`, "danger");
  }
}

function handleGenerate() {
  try {
    if (!state.engineReady) {
      throw new Error("O motor do jogo nao passou na validacao interna.");
    }

    const parsedEntries = parseEntries(manualInput.value);
    const placement = buildCrossword(parsedEntries);

    state.entries = parsedEntries;
    state.placement = placement;

    renderBoard(placement);
    renderClues(placement.words);
    checkButton.disabled = false;
    revealButton.disabled = false;
    boardMeta.textContent = `${placement.rows} linhas x ${placement.cols} colunas | ${placement.words.length} palavras | dificuldade ${placement.difficultyLabel}`;
    setStatus("Palavras cruzadas geradas com sucesso.", "success");
  } catch (error) {
    checkButton.disabled = true;
    revealButton.disabled = true;
    boardMeta.textContent = "Nenhum tabuleiro gerado";
    board.className = "board-empty";
    board.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    acrossClues.innerHTML = "";
    downClues.innerHTML = "";
    setStatus(error.message, "danger");
  }
}

function parseEntries(rawText) {
  const source = rawText.trim();
  if (!source) {
    throw new Error("Informe um JSON ou CSV com pelo menos 2 palavras.");
  }

  let entries;
  if (source.startsWith("{") || source.startsWith("[")) {
    entries = parseJsonEntries(source);
  } else {
    entries = parseCsvEntries(source);
  }

  const sanitized = entries.map((entry, index) => sanitizeEntry(entry, index));
  if (sanitized.length < 2) {
    throw new Error("Use pelo menos 2 palavras para montar o jogo.");
  }

  return sanitized;
}

function parseJsonEntries(source) {
  const parsed = JSON.parse(source);
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (Array.isArray(parsed.entries)) {
    return parsed.entries;
  }
  throw new Error("JSON invalido. Use um array ou um objeto com a chave 'entries'.");
}

function parseCsvEntries(source) {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) {
    throw new Error("CSV invalido. Inclua cabecalho e ao menos uma linha.");
  }

  const headers = splitCsvLine(lines[0]).map((item) => item.trim().toLowerCase());
  const codeIndex = headers.findIndex((header) => ["code", "codigo", "cod", "id"].includes(header));
  const wordIndex = headers.findIndex((header) => ["word", "palavra", "termo"].includes(header));
  const clueIndex = headers.findIndex((header) => ["clue", "dica", "pista"].includes(header));

  if (wordIndex === -1 || clueIndex === -1) {
    throw new Error("CSV invalido. Os campos obrigatorios sao word/palavra e clue/dica.");
  }

  return lines.slice(1).map((line, rowIndex) => {
    const values = splitCsvLine(line);
    return {
      code: codeIndex >= 0 ? values[codeIndex] : `P${rowIndex + 1}`,
      word: values[wordIndex],
      clue: values[clueIndex]
    };
  });
}

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
}

function sanitizeEntry(entry, index) {
  const code = String(entry.code ?? `P${index + 1}`).trim();
  const clue = String(entry.clue ?? entry.dica ?? "").trim();
  const rawWord = String(entry.word ?? entry.palavra ?? "").trim();
  const normalized = normalizeWord(rawWord);

  if (!normalized || normalized.length < 2) {
    throw new Error(`A palavra da linha ${index + 1} precisa ter ao menos 2 letras.`);
  }

  if (!clue) {
    throw new Error(`A dica da linha ${index + 1} nao pode ficar vazia.`);
  }

  return {
    code,
    clue,
    originalWord: rawWord,
    word: normalized
  };
}

function normalizeWord(word) {
  return word
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
}

function buildCrossword(entries) {
  const strategies = createStrategies(entries);
  const candidates = [];

  strategies.forEach((strategy) => {
    const candidate = tryBuildWithOrder(strategy);
    if (candidate) {
      candidates.push(candidate);
    }
  });

  if (!candidates.length) {
    throw new Error("Nao foi possivel montar um tabuleiro com cruzamentos suficientes. Tente palavras com mais letras em comum.");
  }

  candidates.sort((a, b) => b.score - a.score);
  const bestCandidate = candidates[0];
  if (bestCandidate.difficultyScore < 45) {
    throw new Error("As palavras geraram um jogo facil demais. Use termos com mais letras compartilhadas para obter dificuldade mediana ou dificil.");
  }

  return bestCandidate;
}

function createStrategies(entries) {
  const byLength = [...entries].sort((a, b) => b.word.length - a.word.length);
  const byUniqueLetters = [...entries].sort((a, b) => countUniqueLetters(b.word) - countUniqueLetters(a.word));
  const byVowelBalance = [...entries].sort((a, b) => vowelBalanceScore(b.word) - vowelBalanceScore(a.word));
  const rotated = [...byLength.slice(1), byLength[0]];

  return [byLength, byUniqueLetters, byVowelBalance, rotated];
}

function tryBuildWithOrder(orderedEntries) {
  const gridSize = Math.max(20, orderedEntries[0].word.length * 3);
  const grid = Array.from({ length: gridSize }, () => Array(gridSize).fill(null));
  const words = [];

  for (let index = 0; index < orderedEntries.length; index += 1) {
    const entry = orderedEntries[index];
    const placement = index === 0
      ? placeFirstWord(entry, gridSize)
      : placeIntersectingWord(entry, grid, words, gridSize);

    if (!placement) {
      return null;
    }

    words.push(placement);
    writeWordToGrid(placement, grid);
  }

  return trimGrid(grid, words);
}

function placeFirstWord(entry, gridSize) {
  const row = Math.floor(gridSize / 2);
  const col = Math.floor((gridSize - entry.word.length) / 2);
  return { ...entry, row, col, direction: "across" };
}

function placeIntersectingWord(entry, grid, placedWords, gridSize) {
  const attempts = [];

  for (const placedWord of placedWords) {
    for (let i = 0; i < entry.word.length; i += 1) {
      for (let j = 0; j < placedWord.word.length; j += 1) {
        if (entry.word[i] !== placedWord.word[j]) {
          continue;
        }

        const direction = placedWord.direction === "across" ? "down" : "across";
        const row = direction === "down" ? placedWord.row - i : placedWord.row + j;
        const col = direction === "across" ? placedWord.col - i : placedWord.col + j;
        attempts.push({
          ...entry,
          row,
          col,
          direction,
          score: scorePlacement(entry.word, placedWord.word, i, j, placedWord)
        });
      }
    }
  }

  attempts.sort((a, b) => b.score - a.score);
  return attempts.find((attempt) => canPlaceWord(attempt, grid, gridSize)) || null;
}

function scorePlacement(word, anchorWord, wordIndex, anchorIndex, placedWord) {
  const centeredIntersection = Math.min(wordIndex + 1, word.length - wordIndex) + Math.min(anchorIndex + 1, anchorWord.length - anchorIndex);
  const directionBonus = placedWord.direction === "across" ? 2 : 3;
  return word.length + anchorWord.length + centeredIntersection + directionBonus;
}

function canPlaceWord(wordEntry, grid, gridSize) {
  const { row, col, word, direction } = wordEntry;

  for (let index = 0; index < word.length; index += 1) {
    const currentRow = direction === "across" ? row : row + index;
    const currentCol = direction === "across" ? col + index : col;

    if (currentRow < 0 || currentCol < 0 || currentRow >= gridSize || currentCol >= gridSize) {
      return false;
    }

    const currentCell = grid[currentRow][currentCol];
    if (currentCell && currentCell !== word[index]) {
      return false;
    }

    const neighbors = direction === "across"
      ? [[currentRow - 1, currentCol], [currentRow + 1, currentCol]]
      : [[currentRow, currentCol - 1], [currentRow, currentCol + 1]];

    if (!currentCell && neighbors.some(([neighborRow, neighborCol]) => grid[neighborRow]?.[neighborCol])) {
      return false;
    }
  }

  const beforeRow = direction === "across" ? row : row - 1;
  const beforeCol = direction === "across" ? col - 1 : col;
  const afterRow = direction === "across" ? row : row + word.length;
  const afterCol = direction === "across" ? col + word.length : col;

  return !grid[beforeRow]?.[beforeCol] && !grid[afterRow]?.[afterCol];
}

function writeWordToGrid(wordEntry, grid) {
  const { row, col, word, direction } = wordEntry;
  for (let index = 0; index < word.length; index += 1) {
    const currentRow = direction === "across" ? row : row + index;
    const currentCol = direction === "across" ? col + index : col;
    grid[currentRow][currentCol] = word[index];
  }
}

function trimGrid(grid, words) {
  const usedRows = [];
  const usedCols = [];

  grid.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (cell) {
        usedRows.push(rowIndex);
        usedCols.push(colIndex);
      }
    });
  });

  const minRow = Math.min(...usedRows);
  const maxRow = Math.max(...usedRows);
  const minCol = Math.min(...usedCols);
  const maxCol = Math.max(...usedCols);
  const rows = maxRow - minRow + 1;
  const cols = maxCol - minCol + 1;

  const trimmedGrid = Array.from({ length: rows }, (_, rowOffset) =>
    Array.from({ length: cols }, (_, colOffset) => grid[minRow + rowOffset][minCol + colOffset])
  );

  const adjustedWords = words.map((word) => ({
    ...word,
    row: word.row - minRow,
    col: word.col - minCol
  }));

  numberWords(adjustedWords);
  const metrics = calculateDifficultyMetrics(adjustedWords, rows, cols);

  return {
    grid: trimmedGrid,
    rows,
    cols,
    words: adjustedWords,
    ...metrics
  };
}

function numberWords(words) {
  const starts = [...words]
    .sort((a, b) => (a.row - b.row) || (a.col - b.col) || a.direction.localeCompare(b.direction));

  let currentNumber = 1;
  const numberByStart = new Map();

  starts.forEach((word) => {
    const key = `${word.row}:${word.col}`;
    if (!numberByStart.has(key)) {
      numberByStart.set(key, currentNumber);
      currentNumber += 1;
    }
    word.number = numberByStart.get(key);
  });
}

function renderBoard(placement) {
  state.cellMap.clear();
  board.className = "";
  board.innerHTML = "";

  const gridElement = document.createElement("div");
  gridElement.className = "crossword-grid";
  gridElement.style.gridTemplateColumns = `repeat(${placement.cols}, minmax(34px, 42px))`;

  const numbers = new Map(placement.words.map((word) => [`${word.row}:${word.col}`, word.number]));
  const occupied = new Set();
  placement.words.forEach((word) => {
    for (let index = 0; index < word.word.length; index += 1) {
      const row = word.direction === "across" ? word.row : word.row + index;
      const col = word.direction === "across" ? word.col + index : word.col;
      occupied.add(`${row}:${col}`);
    }
  });

  for (let row = 0; row < placement.rows; row += 1) {
    for (let col = 0; col < placement.cols; col += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";

      if (occupied.has(`${row}:${col}`)) {
        cell.classList.add("filled");

        const input = document.createElement("input");
        input.maxLength = 1;
        input.autocomplete = "off";
        input.setAttribute("aria-label", `Letra ${row + 1}-${col + 1}`);
        input.addEventListener("input", () => {
          input.value = normalizeWord(input.value).slice(0, 1);
          moveToNextCell(row, col);
        });
        cell.appendChild(input);
        state.cellMap.set(`${row}:${col}`, input);

        const number = numbers.get(`${row}:${col}`);
        if (number) {
          const badge = document.createElement("span");
          badge.className = "cell-number";
          badge.textContent = number;
          cell.appendChild(badge);
        }
      }

      gridElement.appendChild(cell);
    }
  }

  board.appendChild(gridElement);
}

function runSelfCheck() {
  const parsed = parseEntries(JSON.stringify(SAMPLE_DATA));
  const crossword = buildCrossword(parsed);

  if (!crossword.words.length) {
    throw new Error("nenhuma palavra foi posicionada");
  }

  if (crossword.difficultyScore < 45) {
    throw new Error("o tabuleiro de exemplo ficou abaixo da dificuldade minima");
  }

  crossword.words.forEach((word) => {
    let intersections = 0;
    for (let index = 0; index < word.word.length; index += 1) {
      const row = word.direction === "across" ? word.row : word.row + index;
      const col = word.direction === "across" ? word.col + index : word.col;
      const overlapCount = crossword.words.filter((candidate) => occupiesCell(candidate, row, col)).length;
      if (overlapCount > 1) {
        intersections += 1;
      }
    }

    if (word !== crossword.words[0] && intersections === 0) {
      throw new Error(`a palavra ${word.originalWord} nao cruzou com nenhuma outra`);
    }
  });
}

function moveToNextCell(currentRow, currentCol) {
  const keys = [...state.cellMap.keys()];
  const currentIndex = keys.indexOf(`${currentRow}:${currentCol}`);
  const nextInput = state.cellMap.get(keys[currentIndex + 1]);
  if (nextInput) {
    nextInput.focus();
  }
}

function renderClues(words) {
  acrossClues.innerHTML = "";
  downClues.innerHTML = "";

  const acrossWords = words.filter((word) => word.direction === "across").sort((a, b) => a.number - b.number);
  const downWords = words.filter((word) => word.direction === "down").sort((a, b) => a.number - b.number);

  acrossWords.forEach((word) => acrossClues.appendChild(createClueItem(word)));
  downWords.forEach((word) => downClues.appendChild(createClueItem(word)));
}

function createClueItem(word) {
  const item = document.createElement("li");
  item.innerHTML = `<strong>${word.number}.</strong> <span class="clue-code">${escapeHtml(word.code)}</span>${escapeHtml(word.clue)} <em>(${word.word.length} letras)</em>`;
  return item;
}

function checkAnswers() {
  if (!state.placement) {
    return;
  }

  let correctCells = 0;
  let totalCells = 0;

  state.placement.words.forEach((word) => {
    for (let index = 0; index < word.word.length; index += 1) {
      const row = word.direction === "across" ? word.row : word.row + index;
      const col = word.direction === "across" ? word.col + index : word.col;
      const input = state.cellMap.get(`${row}:${col}`);
      if (!input || input.dataset.checked === "true") {
        continue;
      }

      totalCells += 1;
      const expected = word.word[index];
      const isCorrect = normalizeWord(input.value) === expected;
      input.parentElement.classList.remove("correct", "wrong");
      input.parentElement.classList.add(isCorrect ? "correct" : "wrong");
      input.dataset.checked = "true";

      if (isCorrect) {
        correctCells += 1;
      }
    }
  });

  state.cellMap.forEach((input) => {
    delete input.dataset.checked;
  });

  const percentage = totalCells ? Math.round((correctCells / totalCells) * 100) : 0;
  setStatus(`Voce acertou ${correctCells} de ${totalCells} letras (${percentage}%).`, percentage === 100 ? "success" : "danger");
}

function revealAnswers() {
  if (!state.placement) {
    return;
  }

  state.placement.words.forEach((word) => {
    for (let index = 0; index < word.word.length; index += 1) {
      const row = word.direction === "across" ? word.row : word.row + index;
      const col = word.direction === "across" ? word.col + index : word.col;
      const input = state.cellMap.get(`${row}:${col}`);
      if (!input) {
        continue;
      }
      input.value = word.word[index];
      input.parentElement.classList.remove("wrong");
      input.parentElement.classList.add("correct");
    }
  });

  setStatus("Todas as respostas foram reveladas.", "success");
}

function setStatus(message, tone) {
  statusMessage.textContent = message;
  statusMessage.dataset.tone = tone;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function countUniqueLetters(word) {
  return new Set(word.split("")).size;
}

function vowelBalanceScore(word) {
  const vowels = (word.match(/[AEIOU]/g) || []).length;
  const consonants = word.length - vowels;
  return Math.min(vowels, consonants);
}

function occupiesCell(word, row, col) {
  for (let index = 0; index < word.word.length; index += 1) {
    const currentRow = word.direction === "across" ? word.row : word.row + index;
    const currentCol = word.direction === "across" ? word.col + index : word.col;
    if (currentRow === row && currentCol === col) {
      return true;
    }
  }
  return false;
}

function calculateDifficultyMetrics(words, rows, cols) {
  let intersectionCells = 0;
  let occupiedCells = 0;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const overlapCount = words.filter((word) => occupiesCell(word, row, col)).length;
      if (overlapCount > 0) {
        occupiedCells += 1;
      }
      if (overlapCount > 1) {
        intersectionCells += 1;
      }
    }
  }

  const totalLetters = words.reduce((sum, word) => sum + word.word.length, 0);
  const crossingRatio = totalLetters ? intersectionCells / totalLetters : 0;
  const density = rows * cols ? occupiedCells / (rows * cols) : 0;
  const averageLength = words.length ? totalLetters / words.length : 0;
  const difficultyScore = Math.round((crossingRatio * 55) + (density * 30) + (Math.min(averageLength, 10) * 2));
  const score = difficultyScore + (intersectionCells * 4) - Math.abs(rows - cols);

  return {
    intersectionCells,
    occupiedCells,
    crossingRatio,
    density,
    averageLength,
    difficultyScore,
    difficultyLabel: difficultyScore >= 68 ? "dificil" : "mediana",
    score
  };
}
