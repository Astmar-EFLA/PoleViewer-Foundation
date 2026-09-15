"""
Shared Pydantic base model producing camelCase JSON on the wire, matching
the frontend's TS domain naming (Project, PoleModel, etc. are camelCase),
while Python code uses idiomatic snake_case attribute names. Every
request/response schema in this backend inherits from CamelModel so the
frontend<->backend JSON boundary has one consistent casing convention
rather than each schema picking its own.
"""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
