export const TRACE_FIXTURES = [
  {
    id: 'stack-array',
    label: 'stack array operations',
    readiness: 'supported',
    code:
      'int main() {\n' +
      '  int stack[4];\n' +
      '  int top = -1;\n' +
      '  stack[++top] = 10;\n' +
      '  stack[++top] = 20;\n' +
      '  top--;\n' +
      '  return 0;\n' +
      '}\n'
  },
  {
    id: 'queue-array',
    label: 'queue array operations',
    readiness: 'supported',
    code:
      'int main() {\n' +
      '  int queue[4];\n' +
      '  int front = 0, rear = -1;\n' +
      '  queue[++rear] = 1;\n' +
      '  queue[++rear] = 2;\n' +
      '  front++;\n' +
      '  return 0;\n' +
      '}\n'
  },
  {
    id: 'linked-list',
    label: 'linked list with malloc',
    readiness: 'supported',
    code:
      '#include <stdlib.h>\n' +
      'typedef struct Node {\n' +
      '  int data;\n' +
      '  struct Node* next;\n' +
      '} Node;\n' +
      'Node* make(int data) {\n' +
      '  Node* node = (Node*)malloc(sizeof(Node));\n' +
      '  node->data = data;\n' +
      '  node->next = NULL;\n' +
      '  return node;\n' +
      '}\n' +
      'int main() {\n' +
      '  Node* head = make(1);\n' +
      '  head->next = make(2);\n' +
      '  return 0;\n' +
      '}\n'
  },
  {
    id: 'binary-tree-node-double-pointer',
    label: 'binary tree with Node** root mutation',
    readiness: 'supported',
    code:
      '#include <stdlib.h>\n' +
      'typedef struct Node {\n' +
      '  int data;\n' +
      '  struct Node* left;\n' +
      '  struct Node* right;\n' +
      '} Node;\n' +
      'Node* createNode(int data) {\n' +
      '  Node* node = (Node*)malloc(sizeof(Node));\n' +
      '  node->data = data;\n' +
      '  node->left = NULL;\n' +
      '  node->right = NULL;\n' +
      '  return node;\n' +
      '}\n' +
      'void insert(Node** root, int data) {\n' +
      '  Node* node = createNode(data);\n' +
      '  if (*root == NULL) {\n' +
      '    *root = node;\n' +
      '    return;\n' +
      '  }\n' +
      '  if ((*root)->left == NULL) {\n' +
      '    (*root)->left = node;\n' +
      '    return;\n' +
      '  }\n' +
      '  (*root)->right = node;\n' +
      '}\n' +
      'int main() {\n' +
      '  Node* root = NULL;\n' +
      '  insert(&root, 10);\n' +
      '  insert(&root, 20);\n' +
      '  insert(&root, 30);\n' +
      '  return 0;\n' +
      '}\n'
  },
  {
    id: 'bubble-sort',
    label: 'bubble sort loops',
    readiness: 'supported',
    code:
      'int main() {\n' +
      '  int arr[3] = {3, 1, 2};\n' +
      '  for (int i = 0; i < 3; i++) {\n' +
      '    for (int j = 0; j < 2; j++) {\n' +
      '      if (arr[j] > arr[j + 1]) {\n' +
      '        int temp = arr[j];\n' +
      '        arr[j] = arr[j + 1];\n' +
      '        arr[j + 1] = temp;\n' +
      '      }\n' +
      '    }\n' +
      '  }\n' +
      '  return 0;\n' +
      '}\n'
  },
  {
    id: 'binary-search',
    label: 'binary search loop',
    readiness: 'supported',
    code:
      'int main() {\n' +
      '  int arr[5] = {1, 3, 5, 7, 9};\n' +
      '  int low = 0;\n' +
      '  int high = 4;\n' +
      '  int target = 7;\n' +
      '  while (low <= high) {\n' +
      '    int mid = low + (high - low) / 2;\n' +
      '    if (arr[mid] == target) return mid;\n' +
      '    if (arr[mid] < target) low = mid + 1;\n' +
      '    else high = mid - 1;\n' +
      '  }\n' +
      '  return -1;\n' +
      '}\n'
  },
  {
    id: 'scanf-simple',
    label: 'scanf input replay',
    readiness: 'supported',
    input: '42\n',
    code:
      '#include <stdio.h>\n' +
      'int main() {\n' +
      '  int x = 0;\n' +
      '  scanf("%d", &x);\n' +
      '  return x;\n' +
      '}\n'
  },
  {
    id: 'unsupported-switch',
    label: 'switch case construct',
    readiness: 'unsupported',
    code:
      'int main() {\n' +
      '  int x = 1;\n' +
      '  switch (x) {\n' +
      '    case 1: return 0;\n' +
      '    default: return 1;\n' +
      '  }\n' +
      '}\n'
  },
  {
    id: 'partial-address-of-array-element',
    label: 'address of array element',
    readiness: 'partial',
    code:
      'int main() {\n' +
      '  int arr[3] = {1, 2, 3};\n' +
      '  int* ptr = &(arr[1]);\n' +
      '  return *ptr;\n' +
      '}\n'
  }
];
