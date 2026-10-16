# v8 사진 첨부 전용 패치

압축을 푼 뒤 nutrition-tracker 폴더 안의 app.js, photos.js, index.html, style.css를 GitHub의 같은 폴더에 덮어쓰세요. 데이터 폴더와 나머지 파일은 그대로 두세요.

AI 분석 버튼, 분석 초안, 접근코드 설정, AI 요청 코드를 제거했습니다. 사진 첨부·촬영·확대 보기·첨부 해제는 유지합니다. 기존 식단과 사진 기록도 유지합니다. 기존 기기에 보관된 분석 접근코드는 새 버전을 열면 삭제됩니다.

반영 후 PC는 Ctrl+Shift+R로 새로고침하세요. 모바일은 페이지를 새로고침하거나 앱을 닫았다가 다시 여세요. 저장 데이터 삭제는 하지 마세요.

Supabase 추가 설정은 필요 없습니다. 앞서 생성한 analyze-meal 함수는 이 버전에서 호출하지 않습니다. 더 이상 사용하지 않으므로 Supabase의 Edge Functions에서 analyze-meal 함수를 삭제하고 Secrets에서 OPENAI_API_KEY와 MEAL_AI_ACCESS_TOKEN을 삭제해도 됩니다. 다른 곳에서 사용하는 키라면 먼저 사용 여부를 확인하세요. 기본 Secrets와 meal-photos Storage는 유지하세요.
