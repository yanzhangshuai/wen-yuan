#!/bin/bash
# Update test file to add new props to PersonaChapterReviewPage components

sed -i '
# For lines with initialMatrix={buildMatrix()} that dont have selectedPersonaId yet
/initialMatrix={buildMatrix()}/,/\/>/ {
  # If we see the closing tag and selectedPersonaId is not present in the block
  /\/>/ {
    # Check if selectedPersonaId appears before this line
    x
    /selectedPersonaId/!{
      # Add the props before the closing tag
      s/\/>$/\n        selectedPersonaId={null}\n        focusOnly={false}\n      \/>/
    }
    x
  }
  # Store in hold space to check later
  H
}
# For lines with initialMatrix={buildMatrix({ that dont have selectedPersonaId yet  
/initialMatrix={buildMatrix({/,/\/>/ {
  /\/>/ {
    x
    /selectedPersonaId/!{
      s/\/>$/\n        selectedPersonaId={null}\n        focusOnly={false}\n      \/>/
    }
    x
  }
  H
}
# For lines with initialSelectedCell= that dont have selectedPersonaId yet
/initialSelectedCell=/,/\/>/ {
  /\/>/ {
    x
    /selectedPersonaId/!{
      s/\/>$/\n        selectedPersonaId={null}\n        focusOnly={false}\n      \/>/
    }
    x
  }
  H
}
' src/components/review/persona-chapter-matrix/persona-chapter-review-page.test.tsx
