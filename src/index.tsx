import React, { type MutableRefObject, useMemo, useRef, useState, useEffect } from "react"
import {
  type NativeSyntheticEvent,
  Text,
  TextInput,
  type TextInputSelectionChangeEventData,
  View,
  Platform,
} from "react-native"

import {
  generateValueFromPartsAndChangedText,
  generateValueWithAddedSuggestion,
  getMentionPartSuggestionKeywords,
  isMentionPartType,
  parseValue,
} from "./lib/utils"

import type { MentionInputProps, MentionPartType, Suggestion } from "./lib/types"

export type * from "./lib/types"
export * from "./lib/utils"

let containerWidth = 0

export function Input({
                        value,
                        onChange,
                        partTypes = [],
                        inputRef: propInputRef,
                        containerStyle,
                        onSelectionChange,
                        component: Component = TextInput,
                        onMentionSelected,
                        onMentionRemove,
                        ...textInputProps
                      }: MentionInputProps) {
  const textInput = useRef<TextInput | null>(null)

  const [selection, setSelection] = useState({ start: 0, end: 0 })

  const { plainText, parts } = useMemo(() => parseValue(value, partTypes), [value, partTypes])

  const handleSelectionChange = (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    const sel = event.nativeEvent.selection
    setSelection(sel)

    // Approximate caret position
    const fontSize = 14; // Default font size
    const charWidth = fontSize * 0.52; // Adjusted for AmericanGrotesk-Regular
    const lineHeight = fontSize * 1.2; // Default line height
    console.log('mention.containerWidth', containerWidth)
    const charsPerLine = Math.floor(containerWidth / charWidth); // Dynamic calculation

    const lineNumber = Math.floor(sel.start / charsPerLine);
    const charPositionInLine = sel.start % charsPerLine;

    const caretX = charPositionInLine * charWidth;
    const caretY = lineNumber * lineHeight;

    console.log('mention.caretLayout', { x: caretX, y: caretY });

    // Check if caret is inside a mention part by iterating over parts.
    let foundIndex: number | null = null;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (
        part.partType &&
        sel.start >= part.position.start &&
        sel.start <= part.position.end
      ) {
        foundIndex = i;
        break;
      }
    }

    // If a mention is active, send computed caret position
    if (foundIndex !== null && onMentionSelected) {
      onMentionSelected({
        mention: parts[foundIndex],
        index: foundIndex,
        layout: { x: caretX, y: caretY },
      });
    } else {
      onMentionSelected && onMentionSelected(null);
    }



    onSelectionChange?.(event)
  }

  const onChangeInput = (changedText: string) => {
    onChange(...generateValueFromPartsAndChangedText(parts, plainText, changedText))
  }

  const keywordByTrigger = useMemo(
    () => getMentionPartSuggestionKeywords(parts, plainText, selection, partTypes),
    [parts, plainText, selection, partTypes],
  )


  const onSuggestionPress = (mentionType: MentionPartType) => (suggestion: Suggestion) => {
    const newValue = generateValueWithAddedSuggestion(parts, mentionType, plainText, selection, suggestion)
    if (!newValue) return

    onChange(newValue, parts)

  }

  useEffect(() => {
    if (Platform.OS === "ios") {
      const newSelection = { start: plainText.length, end: plainText.length }
      if (textInput.current) {
        const plainTextParts = plainText.split(" ").filter(plainTextPart => plainTextPart !== "")
        const lastPartIsMention = plainTextParts?.[plainTextParts.length - 1]?.includes("@") || plainTextParts?.[plainTextParts.length - 2]?.includes("@")

        if (lastPartIsMention) {
          textInput.current.setNativeProps({
            selection: newSelection,
          })
        }

      }
    }
  }, [plainText])


  const handleTextInputRef = (ref: TextInput) => {
    textInput.current = ref

    if (propInputRef) {
      if (typeof propInputRef === "function") propInputRef(ref)
      else (propInputRef as MutableRefObject<TextInput>).current = ref
    }
  }

  const handleKeyPress = (event: any) => {
    console.log('mention.handleKeyPress')
    if (event.nativeEvent.key === 'Backspace' && selection.start === selection.end) {
      console.log("mention.Backspace pressed, selection:", selection.start)

      // Check if backspace will delete a mention
      const mentionToDelete = parts.find(
        (part) => part.partType && selection.start - 1 >= part.position.start && selection.start - 1 <= part.position.end
      );

      if (mentionToDelete) {
        console.log('mention.Deleting mention:', mentionToDelete);
        onMentionRemove && onMentionRemove(mentionToDelete);
      }
    }
  }

  const renderMentionSuggestions = (mentionType: MentionPartType) => (
    <React.Fragment key={mentionType.trigger}>
      {mentionType.renderSuggestions?.({
        keyword: keywordByTrigger[mentionType.trigger],
        onSuggestionPress: onSuggestionPress(mentionType),
      })}
    </React.Fragment>
  )

  return (
      <View style={containerStyle} onLayout={(e)=> {
        if (e.nativeEvent.layout.width > 0) {
          containerWidth = e.nativeEvent.layout.width
        }
      }}>
        {(
          partTypes.filter(
            (one) =>
              isMentionPartType(one) &&
              one.renderSuggestions &&
              (!one.renderPosition || one.renderPosition === "top"),
          ) as MentionPartType[]
        ).map(renderMentionSuggestions)}

        <Component
          multiline
          {...textInputProps}
          ref={handleTextInputRef}
          onChangeText={onChangeInput}
          onSelectionChange={handleSelectionChange}
          selection={selection}
          onKeyPress={handleKeyPress}
        >
          <Text>
            {parts.map(({ text, partType, data }, index) =>
              partType ? (
                <Text key={`${index}-${data?.trigger ?? "pattern"}`} style={partType.textStyle} onPress={
                  ()=>console.log('mention.onPress', {text, partType, data})
                }
                      >
                  {text}
                </Text>
              ) : (
                <Text key={index}>{text}</Text>
              ),
            )}
          </Text>
        </Component>

        {(
          partTypes.filter(
            (one) => isMentionPartType(one) && one.renderSuggestions && one.renderPosition === "bottom",
          ) as MentionPartType[]
        ).map(renderMentionSuggestions)}
      </View>
  )
}
