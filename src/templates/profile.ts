/**
 * Returns a usecase header with filled in `name` and `version`.
 */
export function header(name: string, version: string): string {
  return `"""
Whole profile description
"""
name = "${name}"
version = "${version}"
// Comlink Profile specification: https://superface.ai/docs/comlink/profile
`;
}

export function empty(name: string): string {
  return `
"""
${name} use case
Use case description
"""
usecase ${name} {}
`;
}

export function complete(name: string): string {
  return `
"""
${name} usecase
"""
usecase ${name} {
  input {
    "field title"
    foo! string 
  }

  result {
    bar string
  }

  error ErrorModel

  example success {
    input {
      foo = "example"
    }
    result {
      bar = "result"
    }
  }

  example fail {
    input {
      foo = "error"
    }
    error {
      title = "Not Found"
      detail = "Entity not found"
    }
  }
}


model ErrorModel {
  title! string!

  detail string! 
}`;
}
