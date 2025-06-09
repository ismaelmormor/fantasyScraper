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

async function recommendPlayers(players) {
    // Crear barra de progreso
    const bar = new ProgressBar('Processing [:bar] :percent :etas', { total: players.length });

    const recommendedPlayers = [];
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
                const matchup = calendar.jornadas.flatMap(j => j.partidos).find(m => m.local === team.nombre || m.visitante === team.nombre);
                if (matchup) {
                    const opponentTeam = matchup.local === team.nombre ? data.find(t => t.nombre === matchup.visitante) : data.find(t => t.nombre === matchup.local);
                    if (opponentTeam) {
                        if (!shouldDiscardPlayer(player, team, opponentTeam, probability)) {
                            recommendedPlayers.push({ ...player, team: team.nombre, probability, position: normalizedPosition });
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

    // Ordenar por tier y probabilidad para la recomendación
    recommendedPlayers.sort((a, b) => {
        const tierComparison = tierValues[b.tier] - tierValues[a.tier];
        if (tierComparison !== 0) {
            return tierComparison;
        } else {
            return b.probability - a.probability;
        }
    });

    // Formatear y mostrar la lista de todos los jugadores
    console.log('All players in the market:');
    for (const position in allPlayers) {
        console.log(position + ':');
        allPlayers[position].forEach(player => {
            console.log(`- ${player.nombre} (${player.probability}%)`);
        });
    }

    // Formatear y mostrar la lista de jugadores recomendados
    const formattedRecommendedPlayers = {
        Portero: [],
        Defensas: [],
        Centrocampistas: [],
        Delanteros: []
    };

    for (const player of recommendedPlayers) {
        if (player.position === 'Portero') {
            formattedRecommendedPlayers.Portero.push(`${player.nombre} (${player.probability}%)`);
        } else if (player.position === 'Defensa') {
            formattedRecommendedPlayers.Defensas.push(`${player.nombre} (${player.probability}%)`);
        } else if (player.position === 'Centrocampista') {
            formattedRecommendedPlayers.Centrocampistas.push(`${player.nombre} (${player.probability}%)`);
        } else if (player.position === 'Delantero') {
            formattedRecommendedPlayers.Delanteros.push(`${player.nombre} (${player.probability}%)`);
        }
    }

    console.log('Recommended players:');
    console.log('Portero:');
    console.log(`- ${formattedRecommendedPlayers.Portero.join('\n- ')}`);
    console.log('Defensas:');
    console.log(`- ${formattedRecommendedPlayers.Defensas.join('\n- ')}`);
    console.log('Centrocampistas:');
    console.log(`- ${formattedRecommendedPlayers.Centrocampistas.join('\n- ')}`);
    console.log('Delanteros:');
    console.log(`- ${formattedRecommendedPlayers.Delanteros.join('\n- ')}`);
}

// Uso del programa
const marketPlayers = ['Unai García', 'Marcos André', 'Aihen', 'Larin', 'Maffeo', 'Mandi', 'Kubo', 'Iñaki Peña', 'Unai G', 'Odriozola'];
recommendPlayers(marketPlayers);
