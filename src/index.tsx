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

  const prevValuesRef = useRef({ plainText, parts })

  const handleSelectionChange = (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    const sel = event.nativeEvent.selection
    setSelection(sel)

    // Approximate caret position
    const fontSize = 14 // Default font size
    const charWidth = fontSize * 0.46 // Adjusted for AmericanGrotesk-Regular
    const lineHeight = fontSize * 1.2 // Default line height
    console.log("mention.containerWidth", containerWidth)
    const charsPerLine = Math.floor(containerWidth / charWidth) // Dynamic calculation

    const lineNumber = Math.floor(sel.start / charsPerLine)
    const charPositionInLine = sel.start % charsPerLine

    const caretX = charPositionInLine * charWidth
    const caretY = lineNumber * lineHeight

    console.log("mention.caretLayout", { x: caretX, y: caretY })

    // Check if caret is inside a mention part by iterating over parts.
    let foundIndex: number | null = null
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (
        part.partType &&
        sel.start >= part.position.start &&
        sel.start <= part.position.end
      ) {
        foundIndex = i
        break
      }
    }

    // If a mention is active, send computed caret position
    if (foundIndex !== null && onMentionSelected) {
      onMentionSelected({
        mention: parts[foundIndex],
        index: foundIndex,
        layout: { x: caretX, y: caretY },
      })
    } else {
      onMentionSelected && onMentionSelected(null)
    }


    onSelectionChange?.(event)
  }

  const onChangeInput = (changedText: string) => {
    console.log('mention.remove.onChangeInput', changedText)
    console.log('mention.remove.onChange', ...generateValueFromPartsAndChangedText(parts, plainText, changedText))

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
    const {parts: prevParts, plainText: prevPlainText} = prevValuesRef.current
    console.log('mention.prev', prevParts, prevPlainText)

    if (Platform.OS === "ios" && prevPlainText !== plainText) {


      // Compare the previous and current values.
      if (prevPlainText !== plainText || prevParts !== parts) {
        console.log("mention.remove.Previous values:", {prevPlainText, prevParts})
        console.log("mention.remove.Current values:", { plainText, parts })

        // Find all mention parts in previous and current parts arrays.
        const prevMentions = prevParts.filter(part => part.partType);
        const currentMentions = parts.filter(part => part.partType);

        // Determine which mentions have been removed.
        // (This assumes that each mention part has a unique data.id.)
        const removedMentions = prevMentions.filter(
          prevMention => !currentMentions.some(currMention => currMention.data.id === prevMention.data.id)
        );

        console.log('mention.remove.removedMentions', removedMentions)

        let newValue = plainText;

        // If any mention was removed, trigger the removal callback.
        removedMentions.forEach(mention => {
          newValue = newValue.replace(mention.text.trim(), "").trimStart();
          newValue = newValue.replace(mention.text.slice(0, mention.text.length - 1).trim(), "").trimStart();
          newValue = newValue.replace(mention.text.slice(0, mention.text.length - 2).trim(), "").trimStart();
          // console.log("mention.remove.newValueAfterDelete", newValue);
          onMentionRemove(mention);
        });

        if (removedMentions && removedMentions.length > 0) {
          onChangeInput(newValue);

        }


      }

      const newSelection = { start: plainText.length, end: plainText.length }
      if (textInput.current) {
        const lastPartIsMention = parts.length >= 2 && parts[parts.length - 2].partType

        console.log('mention.prevPlainText', prevPlainText)
        const lengthDifference = Math.abs(plainText.length - (prevPlainText ? prevPlainText.length : 0));

        if (lengthDifference >= 5) {
          textInput.current.setNativeProps({
            selection: newSelection,
          })
        }


      }
    }

    prevValuesRef.current = { plainText, parts };

  }, [plainText, parts])


  const handleTextInputRef = (ref: TextInput) => {
    textInput.current = ref

    if (propInputRef) {
      if (typeof propInputRef === "function") propInputRef(ref)
      else (propInputRef as MutableRefObject<TextInput>).current = ref
    }
  }

  // const handleKeyPress = (event: any) => {
  //   console.log("mention.handleKeyPress")
  //   if (event.nativeEvent.key === "Backspace" && selection.start === selection.end) {
  //     console.log("mention.Backspace pressed, selection:", selection.start)
  //
  //     // Check if backspace will delete a mention
  //     const mentionToDelete = parts.find(
  //       (part) => part.partType && selection.start - 1 >= part.position.start && selection.start - 1 <= part.position.end,
  //     )
  //
  //     if (mentionToDelete) {
  //       console.log("mention.Deleting mention:", mentionToDelete)
  //       onMentionRemove && onMentionRemove(mentionToDelete)
  //     }
  //   }
  // }

  const renderMentionSuggestions = (mentionType: MentionPartType) => (
    <React.Fragment key={mentionType.trigger}>
      {mentionType.renderSuggestions?.({
        keyword: keywordByTrigger[mentionType.trigger],
        onSuggestionPress: onSuggestionPress(mentionType),
      })}
    </React.Fragment>
  )

  return (
    <View style={containerStyle} onLayout={(e) => {
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
        // onKeyPress={handleKeyPress}
      >
        <Text>
          {parts.map(({ text, partType, data }, index) =>
            partType ? (
              <Text key={`${index}-${data?.trigger ?? "pattern"}`} style={partType.textStyle} onPress={
                () => console.log("mention.onPress", { text, partType, data })
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
