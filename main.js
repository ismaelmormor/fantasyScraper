const fs = require('fs');
const getPlayerProbs = require('./probs');
const ProgressBar = require('progress');

// Mapa de tiers a valores numéricos
const tierValues = {
    'S': 3,
    'A': 2,
    'B': 1,
    'C': 0
};

// Cargar data.json y calendar.json
const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));
const calendar = JSON.parse(fs.readFileSync('calendar.json', 'utf8'));

async function getPlayerProbability(url) {
    try {
        const probability = await getPlayerProbs(url);
        return parseFloat(probability.replace('%', ''));
    } catch (error) {
        console.log(`No se han encontrado datos de probabilidad para la URL ${url}`);
        return null;
    }
}

function findTeamAndPlayer(playerName) {
    const nameParts = playerName.toLowerCase().split(' ');
    return data.flatMap(team => team.jugadores.map(player => ({ team, player })))
               .find(({ player }) => nameParts.every(part => player.nombre.toLowerCase().includes(part)));
}

function normalizePosition(position) {
    const pos = position.toLowerCase();
    if (pos === 'portero') return 'Portero';
    if (pos === 'defensa') return 'Defensa';
    if (pos === 'centrocampista') return 'Centrocampista';
    if (pos === 'delantero') return 'Delantero';
    return null;
}

function shouldDiscardPlayer(player, team, opponentTeam, probability) {
    const teamTierValue = tierValues[team.tier];
    const opponentTeamTierValue = tierValues[opponentTeam.tier];
    const playerTierValue = tierValues[player.tier];

    if (teamTierValue >= opponentTeamTierValue) {
        return false; // No se descarta si el equipo del jugador tiene un tier mayor o igual que el del equipo oponente
    } else {
        // Tier del equipo del jugador es menor
        if (playerTierValue === 0) { // Tier C
            console.log(`Player ${player.nombre} discarded because player tier is C and opponent team has a higher tier (${opponentTeam.tier})`);
            return true;
        } else if (playerTierValue === 1 && probability < 90) { // Tier B
            console.log(`Player ${player.nombre} discarded because player tier is B and probability (${probability}%) is less than 90%`);
            return true;
        } else if (playerTierValue === 2 && probability < 80) { // Tier A
            console.log(`Player ${player.nombre} discarded because player tier is A and probability (${probability}%) is less than 80%`);
            return true;
        }
    }

    return false;
}

async function generateLineup(players, jornada) {
    const jornadaData = calendar.jornadas.find(j => j.jornada === jornada);
    if (!jornadaData) {
        console.error('Jornada no encontrada');
        return;
    }

    const matchups = jornadaData.partidos;

    // Crear barra de progreso
    const bar = new ProgressBar('Processing [:bar] :percent :etas', { total: players.length });

    const lineup = [];
    const allPlayers = { Portero: [], Defensa: [], Centrocampista: [], Delantero: [] };

    for (const playerName of players) {
        const playerData = findTeamAndPlayer(playerName);

        if (!playerData) {
            console.log(`Player ${playerName} not found`);
            bar.tick();
            continue;
        }

        const { team, player } = playerData;
        const probability = await getPlayerProbability(player.url);
        if (probability !== null) {
            const normalizedPosition = normalizePosition(player.position);
            allPlayers[normalizedPosition].push({ ...player, team: team.nombre, probability });

            if (probability > 50) {
                const matchup = matchups.find(m => m.local === team.nombre || m.visitante === team.nombre);
                if (matchup) {
                    const opponentTeam = matchup.local === team.nombre ? data.find(t => t.nombre === matchup.visitante) : data.find(t => t.nombre === matchup.local);
                    if (opponentTeam) {
                        if (!shouldDiscardPlayer(player, team, opponentTeam, probability)) {
                            lineup.push({ ...player, team: team.nombre, probability, position: normalizedPosition });
                        }
                    } else {
                        console.log(`Opponent team for ${team.nombre} not found`);
                    }
                }
            } else {
                console.log(`Player ${player.nombre} from ${team.nombre} discarded because probability (${probability}%) is not greater than 50%`);
            }
        } else {
            console.log(`Player ${player.nombre} from ${team.nombre} discarded because probability data is not available`);
        }
        bar.tick();
    }

    // Ordenar todos los jugadores por probabilidad
    for (const position in allPlayers) {
        allPlayers[position].sort((a, b) => b.probability - a.probability);
    }

    // Ordenar por tier y probabilidad para la alineación sugerida
    lineup.sort((a, b) => {
        const tierComparison = tierValues[b.tier] - tierValues[a.tier];
        if (tierComparison !== 0) {
            return tierComparison;
        } else {
            return b.probability - a.probability;
        }
    });

    // Asegurar 11 jugadores en la alineación
    const selectedLineup = [];
    let goalkeepers = 0;
    let defenders = 0;
    let midfielders = 0;
    let forwards = 0;

    for (const player of lineup) {
        if (selectedLineup.length < 11) {
            if (goalkeepers < 1 && player.position === 'Portero') {
                selectedLineup.push(player);
                goalkeepers++;
            } else if (defenders < 4 && player.position === 'Defensa') {
                selectedLineup.push(player);
                defenders++;
            } else if (midfielders < 4 && player.position === 'Centrocampista') {
                selectedLineup.push(player);
                midfielders++;
            } else if (forwards < 3 && player.position === 'Delantero') {
                selectedLineup.push(player);
                forwards++;
            }
        }
    }

    // Si no se alcanzan 11 jugadores, llenar con los siguientes jugadores en la lista
    for (const player of lineup) {
        if (selectedLineup.length >= 11) break;
        if (!selectedLineup.includes(player)) {
            if (goalkeepers < 1 && player.position === 'Portero') {
                selectedLineup.push(player);
                goalkeepers++;
            } else if (defenders < 4 && player.position === 'Defensa') {
                selectedLineup.push(player);
                defenders++;
            } else if (midfielders < 4 && player.position === 'Centrocampista') {
                selectedLineup.push(player);
                midfielders++;
            } else if (forwards < 3 && player.position === 'Delantero') {
                selectedLineup.push(player);
                forwards++;
            }
        }
    }

    // Eliminar duplicados en la alineación
    const uniqueSelectedLineup = [];
    const playerNames = new Set();

    for (const player of selectedLineup) {
        if (!playerNames.has(player.nombre)) {
            uniqueSelectedLineup.push(player);
            playerNames.add(player.nombre);
        }
    }

    // Formatear y mostrar la lista de todos los jugadores
    console.log('All players:');
    for (const position in allPlayers) {
        console.log(position + ':');
        allPlayers[position].forEach(player => {
            console.log(`- ${player.nombre} (${player.probability}%)`);
        });
    }

    // Formatear y mostrar la alineación sugerida
    const formattedLineup = {
        Portero: [],
        Defensas: [],
        Centrocampistas: [],
        Delanteros: []
    };

    for (const player of uniqueSelectedLineup) {
        if (player.position === 'Portero') {
            formattedLineup.Portero.push(`${player.nombre} (${player.probability}%)`);
        } else if (player.position === 'Defensa') {
            formattedLineup.Defensas.push(`${player.nombre} (${player.probability}%)`);
        } else if (player.position === 'Centrocampista') {
            formattedLineup.Centrocampistas.push(`${player.nombre} (${player.probability}%)`);
        } else if (player.position === 'Delantero') {
            formattedLineup.Delanteros.push(`${player.nombre} (${player.probability}%)`);
        }
    }

    console.log('Suggested lineup:');
    console.log('Portero:');
    console.log(`- ${formattedLineup.Portero.join('\n- ')}`);
    console.log('Defensas:');
    console.log(`- ${formattedLineup.Defensas.join('\n- ')}`);
    console.log('Centrocampistas:');
    console.log(`- ${formattedLineup.Centrocampistas.join('\n- ')}`);
    console.log('Delanteros:');
    console.log(`- ${formattedLineup.Delanteros.join('\n- ')}`);
}

// Uso del programa
const myPlayers = ['Fernando Pacheco', 'Thibaut Courtois', 'Djené', 'Juan Foyth', 'Andrei', 'Alejandro Catena', 'Hamari Traoré', 'Saúl', 'Alberto Moleiro', 'Enzo Loiodice', 'Arsen Zakharyan', 'Javi Hernández', 'Vedat Muriqi', 'Anastasios Douvikas', 'Alexander Isak'];
const jornada = 1;

generateLineup(myPlayers, jornada);
