// lib/markdown.js
import React from 'react';
import { Text, Platform } from 'react-native';

/**
 * Парсит Markdown текст и возвращает массив React-элементов <Text>
 * Поддерживает: **жирный**, *курсив*, `код`, ~~зачёркнутый~~
 * 
 * @param {string} text - исходный текст с Markdown
 * @param {string} textColor - базовый цвет текста
 * @param {boolean} isOnImage - true, если текст на фоне изображения (для контраста кода)
 */
export const parseMarkdown = (text, textColor = '#000', isOnImage = false) => {
  if (!text) return null;
  
  const elements = [];
  let lastIndex = 0;
  let keyCounter = 0;
  
  const baseStyle = { color: textColor, fontSize: 16 };
  const codeBackground = isOnImage ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.1)';
  
  // Регулярка для поиска всех Markdown-конструкций
  // Порядок важен: ** перед *, чтобы ** не парсилось как два *
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(~~(.+?)~~)/g;
  
  let match;
  while ((match = regex.exec(text)) !== null) {
    // Добавляем обычный текст перед совпадением
    if (match.index > lastIndex) {
      elements.push(
        <Text key={keyCounter++} style={baseStyle}>
          {text.substring(lastIndex, match.index)}
        </Text>
      );
    }
    
    // Определяем тип совпадения и добавляем стилизованный текст
    if (match[1]) {
      // **жирный**
      elements.push(
        <Text key={keyCounter++} style={[baseStyle, { fontWeight: 'bold' }]}>
          {match[2]}
        </Text>
      );
    } else if (match[3]) {
      // *курсив*
      elements.push(
        <Text key={keyCounter++} style={[baseStyle, { fontStyle: 'italic' }]}>
          {match[4]}
        </Text>
      );
    } else if (match[5]) {
      // `код`
      elements.push(
        <Text 
          key={keyCounter++} 
          style={[
            baseStyle, 
            { 
              fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier',
              backgroundColor: codeBackground,
              paddingHorizontal: 4,
              paddingVertical: 2,
              borderRadius: 4,
            }
          ]}
        >
          {match[6]}
        </Text>
      );
    } else if (match[7]) {
      // ~~зачёркнутый~~
      elements.push(
        <Text key={keyCounter++} style={[baseStyle, { textDecorationLine: 'line-through' }]}>
          {match[8]}
        </Text>
      );
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // Добавляем оставшийся текст после последнего совпадения
  if (lastIndex < text.length) {
    elements.push(
      <Text key={keyCounter++} style={baseStyle}>
        {text.substring(lastIndex)}
      </Text>
    );
  }
  
  // Если совпадений не было, возвращаем весь текст как есть
  if (elements.length === 0) {
    return <Text style={baseStyle}>{text}</Text>;
  }
  
  return elements;
};

/**
 * Оборачивает текст в Markdown-символы на основе позиции курсора
 * Если есть выделение — оборачивает выделенное
 * Если нет выделения — вставляет пару маркеров
 * 
 * @param {string} text - текущий текст в поле ввода
 * @param {object} selection - { start, end } позиция курсора/выделения
 * @param {string} marker - Markdown-маркер (например, '**' или '*')
 * @returns {object} { text: новый текст, newSelection: новая позиция курсора }
 */
export const wrapWithMarkdown = (text, selection, marker) => {
  const start = selection?.start ?? text.length;
  const end = selection?.end ?? text.length;
  
  if (start === end) {
    // Нет выделения — вставляем пару маркеров
    const before = text.substring(0, start);
    const after = text.substring(end);
    return {
      text: `${before}${marker}${marker}${after}`,
      newSelection: { start: start + marker.length, end: start + marker.length }
    };
  } else {
    // Есть выделение — оборачиваем выделенное
    const selected = text.substring(start, end);
    const before = text.substring(0, start);
    const after = text.substring(end);
    return {
      text: `${before}${marker}${selected}${marker}${after}`,
      newSelection: { start: start, end: end + marker.length * 2 }
    };
  }
};