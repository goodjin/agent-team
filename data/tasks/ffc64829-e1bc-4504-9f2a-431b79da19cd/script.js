// DOM元素
const letterContainer = document.getElementById('letterContainer');
const selectedLetterDisplay = document.getElementById('selectedLetter');
const clickCountDisplay = document.getElementById('clickCount');
const displayAllBtn = document.getElementById('displayAllBtn');
const randomBtn = document.getElementById('randomBtn');
const resetBtn = document.getElementById('resetBtn');

// 状态变量
let selectedLetter = null;
let clickCount = 0;
let isRandomMode = false;

// 初始化字母表
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// 创建字母元素
function createLetterElements() {
    letterContainer.innerHTML = '';
    
    for (let i = 0; i < alphabet.length; i++) {
        const letter = alphabet[i];
        const letterElement = document.createElement('div');
        letterElement.className = 'letter-item';
        letterElement.textContent = letter;
        letterElement.dataset.letter = letter;
        
        // 添加点击事件
        letterElement.addEventListener('click', () => handleLetterClick(letter, letterElement));
        
        letterContainer.appendChild(letterElement);
    }
}

// 处理字母点击
function handleLetterClick(letter, element) {
    // 更新点击计数
    clickCount++;
    clickCountDisplay.textContent = clickCount;
    
    // 移除之前选中的字母的样式
    if (selectedLetter) {
        const prevSelected = document.querySelector('.letter-item.selected');
        if (prevSelected) {
            prevSelected.classList.remove('selected');
        }
    }
    
    // 选中当前字母
    selectedLetter = letter;
    selectedLetterDisplay.textContent = letter;
    element.classList.add('selected');
    
    // 添加动画效果
    element.style.animation = 'none';
    setTimeout(() => {
        element.style.animation = 'reveal 0.3s ease-out';
    }, 10);
}

// 切换到显示全部模式
function showAllLetters() {
    if (!isRandomMode) return;
    
    isRandomMode = false;
    displayAllBtn.classList.add('active');
    randomBtn.classList.remove('active');
    
    const letters = document.querySelectorAll('.letter-item');
    letters.forEach(letter => {
        letter.classList.remove('hidden');
        letter.classList.add('revealed');
    });
}

// 切换到随机显示模式
function showRandomLetters() {
    isRandomMode = true;
    randomBtn.classList.add('active');
    displayAllBtn.classList.remove('active');
    
    const letters = document.querySelectorAll('.letter-item');
    
    // 隐藏所有字母
    letters.forEach(letter => {
        letter.classList.add('hidden');
        letter.classList.remove('revealed');
    });
    
    // 随机显示15个字母
    setTimeout(() => {
        const shuffled = Array.from(letters).sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 15);
        
        selected.forEach(letter => {
            letter.classList.remove('hidden');
            letter.classList.add('revealed');
        });
    }, 100);
}

// 重置选择
function resetSelection() {
    selectedLetter = null;
    clickCount = 0;
    selectedLetterDisplay.textContent = '无';
    clickCountDisplay.textContent = '0';
    
    const letters = document.querySelectorAll('.letter-item');
    letters.forEach(letter => {
        letter.classList.remove('selected');
    });
}

// 事件监听器
displayAllBtn.addEventListener('click', showAllLetters);
randomBtn.addEventListener('click', showRandomLetters);
resetBtn.addEventListener('click', resetSelection);

// 初始化页面
createLetterElements();

// 页面加载动画
window.addEventListener('load', () => {
    const letters = document.querySelectorAll('.letter-item');
    
    letters.forEach((letter, index) => {
        setTimeout(() => {
            letter.classList.add('revealed');
        }, index * 30);
    });
});