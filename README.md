# Answer Lens V1 API Documentation (Internal Version)

## Introduction

This document outlines the internal API for the Answer Lens application. Designed for internal development, testing, and integration purposes, this API facilitates the upload and processing of images to extract text-based questions and generate answers. Please note that this API does not have public endpoints.

### Answer Generation

**Description:** Processes an uploaded image to identify text-based questions and returns generated answers.

- **Method:** POST
- **Body Requirements:**
  - `img`: The image file containing the question(s).
  - `key`: A unique security key for request validation.
  - `time`: The timestamp of the request, used for security checks.
  - `id`: A unique identifier for the user or session.

- **Success Response:** A JSON object containing the questions found in the image along with their respective answers and explanations.

```json
{
  "success": true,
  "final": [
    {
      "question": "What is the capital of France?",
      "answer": "Paris",
      "explanation": "Paris is the capital and most populous city of France."
    }
  ]
}
```

### Usage Tracking

**Description:** Manages and tracks the usage credits for specific users or sessions.

- **Method:** POST
- **Body Requirements:**
  - `id`: The unique identifier for the user or session being queried.

- **Success Response:** Current credit balance and usage details for the specified identifier.

```json
{
  "success": true,
  "credits": 5
}
```

### Testing

You can download and test out the Answer Lens app [here](https://apps.apple.com/us/app/answer-lens/id6475650817). Please note that the current app is running on V2 of the API so it's not the same.
