class LetterGame {
    constructor(options = {}) {
        // 默认设置
        this.settings = {
            alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
            wordLength: 5,
            maxAttempts: 6,
            ...options
        };
        
        // 游戏状态
        this.resetGame();
    }
    
    // 重置游戏
    resetGame() {
        this.currentWord = '';
        this.guessedLetters = new Set();
        this.correctLetters = new Set();
        this.wrongLetters = new Set();
        this.attempts = 0;
        this.gameOver = false;
        this.wordFound = false;
    }
    
    // 生成随机单词
    generateRandomWord() {
        const { alphabet, wordLength } = this.settings;
        let word = '';
        
        for (let i = 0; i < wordLength; i++) {
            const randomIndex = Math.floor(Math.random() * alphabet.length);
            word += alphabet[randomIndex];
        }
        
        this.currentWord = word;
        return word;
    }
    
    // 处理字母猜测
    guessLetter(letter) {
        if (this.gameOver) {
            return {
                valid: false,
                message: '游戏已结束，请重置游戏。'
            };
        }
        
        if (this.guessedLetters.has(letter)) {
            return {
                valid: false,
                message: '您已经猜过这个字母了。'
            };
        }
        
        if (!this.settings.alphabet.includes(letter)) {
            return {
                valid: false,
                message: '请输入有效的字母。'
            };
        }
        
        // 记录已猜测的字母
        this.guessedLetters.add(letter);
        this.attempts++;
        
        // 检查字母是否正确
        if (this.currentWord.includes(letter)) {
            this.correctLetters.add(letter);
            
            // 检查是否找到了所有字母
            const allLettersFound = this.currentWord
                .split('')
                .every(char => this.correctLetters.has(char));
                
            if (allLettersFound) {
                this.wordFound = true;
                this.gameOver = true;
                return {
                    valid: true,
                    correct: true,
                    message: `恭喜！您猜对了单词: ${this.currentWord}`,
                    gameOver: true,
                    won: true
                };
            }
            
            return {
                valid: true,
                correct: true,
                message: '猜对了！'
            };
        } else {
            this.wrongLetters.add(letter);
            
            // 检查是否用完了所有尝试次数
            if (this.attempts >= this.settings.maxAttempts) {
                this.gameOver = true;
                return {
                    valid: true,
                    correct: false,
                    message: `游戏结束！正确答案是: ${this.currentWord}`,
                    gameOver: true,
                    won: false
                };
            }
            
            return {
                valid: true,
                correct: false,
                message: '猜错了，再试试！'
            };
        }
    }
    
    // 获取游戏状态
    getGameState() {
        return {
            currentWord: this.currentWord,
            guessedLetters: Array.from(this.guessedLetters),
            correctLetters: Array.from(this.correctLetters),
            wrongLetters: Array.from(this.wrongLetters),
            attempts: this.attempts,
            maxAttempts: this.settings.maxAttempts,
            gameOver: this.gameOver,
            wordFound: this.wordFound,
            progress: this.calculateProgress()
        };
    }
    
    // 计算游戏进度
    calculateProgress() {
        if (!this.currentWord) return 0;
        
        const uniqueLetters = new Set(this.currentWord.split(''));
        const foundLetters = Array.from(uniqueLetters).filter(letter => 
            this.correctLetters.has(letter)
        ).length;
        
        return foundLetters / uniqueLetters.size;
    }
    
    // 获取隐藏的单词（用于显示未猜中的字母）
    getHiddenWord() {
        if (!this.currentWord) return '';
        
        return this.currentWord
            .split('')
            .map(letter => this.correctLetters.has(letter) ? letter : '_')
            .join(' ');
    }
    
    // 开始新游戏
    startNewGame() {
        this.resetGame();
        this.generateRandomWord();
        return this.getGameState();
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LetterGame;
}

// 如果在浏览器环境中，添加到全局对象
if (typeof window !== 'undefined') {
    window.LetterGame = LetterGame;
}

// 使用示例
const game = new LetterGame({
    wordLength: 4,
    maxAttempts: 5
});

console.log('开始新游戏:', game.startNewGame());
console.log('猜测字母 A:', game.guessLetter('A')); 
console.log('猜测字母 Z:', game.guessLetter('Z')); 
console.log('当前隐藏的单词:', game.getHiddenWord());
console.log('游戏状态:', game.getGameState());
