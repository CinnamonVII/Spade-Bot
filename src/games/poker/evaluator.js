const { RANKS } = require('./deck');

const HAND_RANKS = [
    'High Card', 'Pair', 'Two Pair', 'Three of a Kind',
    'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush'
];

function getCardValue(rank) {
    return RANKS.indexOf(rank) + 2;
}

function findBestHand(cards) {
    if (cards.length < 5) return { rank: 'Error', value: 0, kickers: [] }; 

    
    
    const combos = getCombinations(cards, 5);
    let bestHand = null;

    for (const hand of combos) {
        const result = evaluate5CardHand(hand);
        if (!bestHand || compareHands(result, bestHand) > 0) {
            bestHand = result;
        }
    }
    return bestHand;
}

function getCombinations(arr, k) {
    if (k === 0) return [[]];
    if (arr.length === 0) return [];

    const first = arr[0];
    const rest = arr.slice(1);

    const combsWithFirst = getCombinations(rest, k - 1).map(c => [first, ...c]);
    const combsWithoutFirst = getCombinations(rest, k);

    return [...combsWithFirst, ...combsWithoutFirst];
}

function evaluate5CardHand(cards) {
    
    cards.sort((a, b) => getCardValue(b.rank) - getCardValue(a.rank));

    const isFlush = cards.every(c => c.suit === cards[0].suit);

    let isStraight = true;
    for (let i = 0; i < 4; i++) {
        if (getCardValue(cards[i].rank) - 1 !== getCardValue(cards[i + 1].rank)) {
            
            if (i === 0 && cards[0].rank === 'A' && cards[1].rank === '5' && cards[2].rank === '4' && cards[3].rank === '3' && cards[4].rank === '2') {
                
                continue;
            }
            isStraight = false;
            break;
        }
    }
    
    
    
    
    const isWheel = !isStraight && cards[0].rank === 'A' && cards[1].rank === '5' && cards[2].rank === '4' && cards[3].rank === '3' && cards[4].rank === '2';
    if (isWheel) isStraight = true;

    
    const counts = {};
    for (const c of cards) {
        const v = getCardValue(c.rank);
        counts[v] = (counts[v] || 0) + 1;
    }

    const countValues = Object.values(counts);
    const isFour = countValues.includes(4);
    const isThree = countValues.includes(3);
    const isPair = countValues.includes(2);
    const pairs = countValues.filter(c => c === 2).length;

    let rankIndex = 0;

    if (isStraight && isFlush) {
        if (cards[0].rank === 'A' && !isWheel) rankIndex = 9; 
        else rankIndex = 8;
    }
    else if (isFour) rankIndex = 7;
    else if (isThree && isPair) rankIndex = 6;
    else if (isFlush) rankIndex = 5;
    else if (isStraight) rankIndex = 4;
    else if (isThree) rankIndex = 3;
    else if (pairs === 2) rankIndex = 2;
    else if (pairs === 1) rankIndex = 1;
    else rankIndex = 0;

    return {
        name: HAND_RANKS[rankIndex],
        rank: HAND_RANKS[rankIndex],
        rankIndex: rankIndex,
        cards: cards,
        isWheel: isWheel
    };
}

function compareHands(h1, h2) {
    if (h1.rankIndex > h2.rankIndex) return 1;
    if (h1.rankIndex < h2.rankIndex) return -1;

    
    
    
    

    const sortForTie = (hand) => {
        const counts = {};
        for (const c of hand.cards) {
            const v = getCardValue(c.rank);
            counts[v] = (counts[v] || 0) + 1;
        }
        return hand.cards.slice().sort((a, b) => {
            const va = getCardValue(a.rank);
            const vb = getCardValue(b.rank);
            const ca = counts[va];
            const cb = counts[vb];
            if (ca !== cb) return cb - ca; 
            return vb - va; 
        });
    };

    const c1 = sortForTie(h1);
    const c2 = sortForTie(h2);

    
    if (h1.isWheel) {
        
        
        
        
        
        
    }

    
    for (let i = 0; i < 5; i++) {
        let v1 = getCardValue(c1[i].rank);
        let v2 = getCardValue(c2[i].rank);

        if (h1.isWheel && c1[i].rank === 'A') v1 = 1;
        if (h2.isWheel && c2[i].rank === 'A') v2 = 1;

        if (v1 > v2) return 1;
        if (v1 < v2) return -1;
    }

    return 0;
}

module.exports = { findBestHand, compareHands, handRankings: HAND_RANKS };
