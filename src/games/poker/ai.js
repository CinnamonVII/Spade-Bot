const { findBestHand, handRankings } = require('./evaluator');

class PokerAI {
    constructor(difficulty = 'easy') {
        this.difficulty = difficulty.toLowerCase();
    }

    
    decideMove(gameState, myPlayer) {
        const { currentBet, pot, communityCards, bigBlind } = gameState;
        const myCards = myPlayer.cards;
        const callAmount = currentBet - myPlayer.currentBet;
        const canCheck = callAmount === 0;

        

        if (this.difficulty === 'easy') {
            return this.strategyEasy(canCheck, callAmount, myPlayer.chips);
        } else if (this.difficulty === 'medium') {
            return this.strategyMedium(gameState, myPlayer, canCheck, callAmount);
        } else if (this.difficulty === 'hard') {
            return this.strategyHard(gameState, myPlayer, canCheck, callAmount);
        }

        return { action: 'fold' }; 
    }

    strategyEasy(canCheck, callAmount, chips) {
        
        const rand = Math.random();

        if (canCheck) {
            
            if (rand > 0.9 && chips > 0) return { action: 'raise', amount: 0 }; 
            return { action: 'check' };
        }

        
        
        if (callAmount < chips * 0.1) {
            return { action: 'call' };
        }

        
        if (rand > 0.5) return { action: 'call' };
        return { action: 'fold' };
    }

    strategyMedium(gameState, myPlayer, canCheck, callAmount) {
        const { communityCards } = gameState;
        const allCards = [...myPlayer.cards, ...communityCards];

        
        if (communityCards.length === 0) {
            const strength = this.evaluatePreFlop(myPlayer.cards);
            if (strength > 7) { 
                if (Math.random() > 0.3) return { action: 'raise', amount: 0 };
                return { action: 'call' };
            }
            if (strength > 4 || canCheck) return canCheck ? { action: 'check' } : { action: 'call' };
            return { action: 'fold' };
        }

        
        const bestHand = findBestHand(allCards);
        const rankValue = this.getRankValue(bestHand.rank); 

        
        

        
        if (Math.random() < 0.1) return { action: 'raise', amount: 0 };

        if (rankValue >= 2) { 
            if (canCheck && Math.random() > 0.4) return { action: 'raise', amount: 0 }; 
            return canCheck ? { action: 'check' } : { action: 'call' };
        }

        if (rankValue === 1) { 
            
            if (callAmount < gameState.pot * 0.5) return { action: 'call' };
            return canCheck ? { action: 'check' } : { action: 'fold' };
        }

        return canCheck ? { action: 'check' } : { action: 'fold' };
    }

    strategyHard(gameState, myPlayer, canCheck, callAmount) {
        
        
        

        const { communityCards, pot } = gameState;
        const allCards = [...myPlayer.cards, ...communityCards];

        
        if (communityCards.length === 0) {
            const strength = this.evaluatePreFlop(myPlayer.cards);
            
            if (strength >= 8) return { action: 'raise', amount: 0 }; 
            if (strength >= 5) return { action: 'call' };

            
            if (canCheck && Math.random() > 0.7) return { action: 'raise', amount: 0 };

            return canCheck ? { action: 'check' } : { action: 'fold' };
        }

        
        const bestHand = findBestHand(allCards);
        const rankValue = this.getRankValue(bestHand.rank);

        
        
        let winProb = 0.1;
        if (rankValue >= 1) winProb = 0.3; 
        if (rankValue >= 2) winProb = 0.6; 
        if (rankValue >= 3) winProb = 0.8; 

        
        

        const potOdds = callAmount / (pot + callAmount);

        if (winProb > potOdds) {
            
            if (winProb > 0.7 && Math.random() > 0.2) return { action: 'raise', amount: 0 };
            return canCheck ? { action: 'check' } : { action: 'call' };
        }

        
        if (Math.random() < 0.15) return { action: 'raise', amount: 0 };

        return canCheck ? { action: 'check' } : { action: 'fold' };
    }

    
    evaluatePreFlop(cards) {
        if (cards.length !== 2) return 0;
        const c1 = cards[0];
        const c2 = cards[1];

        const r1 = c1.rank; 
        const r2 = c2.rank;

        let score = 0;

        
        if (r1 > 10) score += (r1 - 10);
        if (r2 > 10) score += (r2 - 10);

        
        if (r1 === r2) score += 5;

        
        if (c1.suit === c2.suit) score += 2;

        
        if (Math.abs(r1 - r2) < 2) score += 1;

        return score; 
    }

    getRankValue(rankName) {
        const ranks = ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush'];
        return ranks.indexOf(rankName);
    }
}

module.exports = PokerAI;
