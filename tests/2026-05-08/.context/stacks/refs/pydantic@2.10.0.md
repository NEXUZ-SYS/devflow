<<<DEVFLOW_STACK_REF_START_ae9b68d16fca8880>>>
TITLE: Basic model usage
DESCRIPTION: Basic model usage
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from pydantic import BaseModelclass User(BaseModel):    id: int    name: str = 'Jane Doe'
```

----------------------------------------

TITLE: Basic model usage
DESCRIPTION: The model can then be instantiated:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
user = User(id='123')
```

----------------------------------------

TITLE: Basic model usage
DESCRIPTION: Fields of a model can be accessed as normal attributes of the `user` object:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
assert user.name == 'Jane Doe'  assert user.id == 123  assert isinstance(user.id, int)
```

----------------------------------------

TITLE: Basic model usage
DESCRIPTION: The model instance can be serialized using the [`model_dump`](https://pydantic.dev/docs/validation/2.10/api/pydantic/base_model/#pydantic.BaseModel.model_dump) method:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
assert user.model_dump() == {'id': 123, 'name': 'Jane Doe'}
```

----------------------------------------

TITLE: Basic model usage
DESCRIPTION: By default, models are mutable and field values can be changed through attribute assignment:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
user.id = 321assert user.id == 321
```

----------------------------------------

TITLE: Nested models
DESCRIPTION: More complex hierarchical data structures can be defined using models themselves as types in annotations.
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from typing import List, Optionalfrom pydantic import BaseModelclass Foo(BaseModel):    count: int    size: Optional[float] = Noneclass Bar(BaseModel):    apple: str = 'x'    banana: str = 'y'class Spam(BaseModel):    foo: Foo    bars: List[Bar]m = Spam(foo={'count': 4}, bars=[{'apple': 'x1'}, {'apple': 'x2'}])print(m)"""foo=Foo(count=4, size=None) bars=[Bar(apple='x1', banana='y'), Bar(apple='x2', banana='y')]"""print(m.model_dump())"""{    'foo': {'count': 4, 'size': None},    'bars': [{'apple': 'x1', 'banana': 'y'}, {'apple': 'x2', 'banana': 'y'}],}"""
```

----------------------------------------

TITLE: Rebuilding model schema
DESCRIPTION: When you define a model class in your code, Pydantic will analyze the body of the class to collect a variety of information required to perform validation and serialization, gathered in a core schema. Notably, the model’s type annotations are evaluated to understand the valid types for each field (more information can be found in the [Architecture](https://pydantic.dev/docs/validation/2.10/internals/architecture) documentation). However, it might be the case that annotations refer to symbols not defined when the model class is being created. To circumvent this issue, the [`model_rebuild()`](https://pydantic.dev/docs/validation/2.10/api/pydantic/base_model/#pydantic.BaseModel.model_rebuild) method can be used:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from pydantic import BaseModel, PydanticUserErrorclass Foo(BaseModel):  x: 'Bar'  try:  Foo.model_json_schema()except PydanticUserError as e:  print(e)  """  `Foo` is not fully defined; you should define `Bar`, then call `Foo.model_rebuild()`.  For further information visit https://errors.pydantic.dev/2/u/class-not-fully-defined  """class Bar(BaseModel):  passFoo.model_rebuild()print(Foo.model_json_schema())"""{  '$defs': {'Bar': {'properties': {}, 'title': 'Bar', 'type': 'object'}},  'properties': {'x': {'$ref': '#/$defs/Bar'}},  'required': ['x'],  'title': 'Foo',  'type': 'object',}"""
```

----------------------------------------

TITLE: Arbitrary class instances
DESCRIPTION: The example here uses [SQLAlchemy](https://www.sqlalchemy.org/), but the same approach should work for any ORM.
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from typing import Listfrom sqlalchemy import ARRAY, Stringfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_columnfrom typing_extensions import Annotatedfrom pydantic import BaseModel, ConfigDict, StringConstraintsclass Base(DeclarativeBase):    passclass CompanyOrm(Base):    __tablename__ = 'companies'    id: Mapped[int] = mapped_column(primary_key=True, nullable=False)    public_key: Mapped[str] = mapped_column(        String(20), index=True, nullable=False, unique=True    )    domains: Mapped[List[str]] = mapped_column(ARRAY(String(255)))class CompanyModel(BaseModel):    model_config = ConfigDict(from_attributes=True)    id: int    public_key: Annotated[str, StringConstraints(max_length=20)]    domains: List[Annotated[str, StringConstraints(max_length=255)]]co_orm = CompanyOrm(    id=123,    public_key='foobar',    domains=['example.com', 'foobar.com'],)print(co_orm)#> <__main__.CompanyOrm object at 0x0123456789ab>co_model = CompanyModel.model_validate(co_orm)print(co_model)#> id=123 public_key='foobar' domains=['example.com', 'foobar.com']
```

----------------------------------------

TITLE: Nested attributes
DESCRIPTION: Here is an example demonstrating the principle:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from typing import Listfrom pydantic import BaseModel, ConfigDictclass PetCls:    def __init__(self, *, name: str, species: str):        self.name = name        self.species = speciesclass PersonCls:    def __init__(self, *, name: str, age: float = None, pets: List[PetCls]):        self.name = name        self.age = age        self.pets = petsclass Pet(BaseModel):    model_config = ConfigDict(from_attributes=True)    name: str    species: strclass Person(BaseModel):    model_config = ConfigDict(from_attributes=True)    name: str    age: float = None    pets: List[Pet]bones = PetCls(name='Bones', species='dog')orion = PetCls(name='Orion', species='cat')anna = PersonCls(name='Anna', age=20, pets=[bones, orion])anna_model = Person.model_validate(anna)print(anna_model)"""name='Anna' age=20.0 pets=[Pet(name='Bones', species='dog'), Pet(name='Orion', species='cat')]"""
```

----------------------------------------

TITLE: Error handling
DESCRIPTION: As a demonstration:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from typing import Listfrom pydantic import BaseModel, ValidationErrorclass Model(BaseModel):    list_of_ints: List[int]    a_float: floatdata = dict(    list_of_ints=['1', 2, 'bad'],    a_float='not a float',)try:    Model(**data)except ValidationError as e:    print(e)    """    2 validation errors for Model    list_of_ints.2      Input should be a valid integer, unable to parse string as an integer [type=int_parsing, input_value='bad', input_type=str]    a_float      Input should be a valid number, unable to parse string as a number [type=float_parsing, input_value='not a float', input_type=str]    """
```

----------------------------------------

TITLE: Validating data
DESCRIPTION: [`model_validate_strings()`](https://pydantic.dev/docs/validation/2.10/api/pydantic/base_model/#pydantic.BaseModel.model_validate_strings): this takes a dictionary (can be nested) with string keys and values and validates the data in JSON mode so that said strings can be coerced into the correct types.
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from datetime import datetimefrom typing import Optionalfrom pydantic import BaseModel, ValidationErrorclass User(BaseModel):    id: int    name: str = 'John Doe'    signup_ts: Optional[datetime] = Nonem = User.model_validate({'id': 123, 'name': 'James'})print(m)#> id=123 name='James' signup_ts=Nonetry:    User.model_validate(['not', 'a', 'dict'])except ValidationError as e:    print(e)    """    1 validation error for User      Input should be a valid dictionary or instance of User [type=model_type, input_value=['not', 'a', 'dict'], input_type=list]    """m = User.model_validate_json('{"id": 123, "name": "James"}')print(m)#> id=123 name='James' signup_ts=Nonetry:    m = User.model_validate_json('{"id": 123, "name": 123}')except ValidationError as e:    print(e)    """    1 validation error for User    name      Input should be a valid string [type=string_type, input_value=123, input_type=int]    """try:    m = User.model_validate_json('invalid JSON')except ValidationError as e:    print(e)    """    1 validation error for User      Invalid JSON: expected value at line 1 column 1 [type=json_invalid, input_value='invalid JSON', input_type=str]    """m = User.model_validate_strings({'id': '123', 'name': 'James'})print(m)#> id=123 name='James' signup_ts=Nonem = User.model_validate_strings(    {'id': '123', 'name': 'James', 'signup_ts': '2024-04-01T12:00:00'})print(m)#> id=123 name='James' signup_ts=datetime.datetime(2024, 4, 1, 12, 0)try:    m = User.model_validate_strings(        {'id': '123', 'name': 'James', 'signup_ts': '2024-04-01'}, strict=True    )except ValidationError as e:    print(e)    """    1 validation error for User    signup_ts      Input should be a valid datetime, invalid datetime separator, expected `T`, `t`, `_` or space [type=datetime_parsing, input_value='2024-04-01', input_type=str]    """
```

----------------------------------------

TITLE: Validating data
DESCRIPTION: :white\_check\_mark: revalidate\_instances='always'
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from pydantic import BaseModelclass Model(BaseModel):    a: intm = Model(a=0)# note: setting `validate_assignment` to `True` in the config can prevent this kind of misbehavior.m.a = 'not an int'# doesn't raise a validation error even though m is invalidm2 = Model.model_validate(m)
```

----------------------------------------

TITLE: Validating data
DESCRIPTION: 
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from pydantic import BaseModel, ConfigDict, ValidationErrorclass Model(BaseModel):    a: int    model_config = ConfigDict(revalidate_instances='always')m = Model(a=0)# note: setting `validate_assignment` to `True` in the config can prevent this kind of misbehavior.m.a = 'not an int'try:    m2 = Model.model_validate(m)except ValidationError as e:    print(e)    """    1 validation error for Model    a      Input should be a valid integer, unable to parse string as an integer [type=int_parsing, input_value='not an int', input_type=str]    """
```

----------------------------------------

TITLE: Generic models
DESCRIPTION: Here is an example using a generic Pydantic model to create an easily-reused HTTP response payload wrapper:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from typing import Generic, List, Optional, TypeVarfrom pydantic import BaseModel, ValidationErrorDataT = TypeVar('DataT')  class DataModel(BaseModel):  numbers: List[int]  people: List[str]class Response(BaseModel, Generic[DataT]):    data: Optional[DataT] = None  print(Response[int](data=1))#> data=1print(Response[str](data='value'))#> data='value'print(Response[str](data='value').model_dump())#> {'data': 'value'}data = DataModel(numbers=[1, 2, 3], people=[])print(Response[DataModel](data=data).model_dump())#> {'data': {'numbers': [1, 2, 3], 'people': []}}try:  Response[int](data='value')except ValidationError as e:  print(e)  """  1 validation error for Response[int]  data    Input should be a valid integer, unable to parse string as an integer [type=int_parsing, input_value='value', input_type=str]  """
```

----------------------------------------

TITLE: Generic models
DESCRIPTION: To inherit from a generic model and preserve the fact that it is generic, the subclass must also inherit from `Generic`:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from typing import Generic, TypeVarfrom pydantic import BaseModelTypeX = TypeVar('TypeX')class BaseClass(BaseModel, Generic[TypeX]):    X: TypeXclass ChildClass(BaseClass[TypeX], Generic[TypeX]):    pass# Parametrize `TypeX` with `int`:print(ChildClass[int](X=1))#> X=1
```

----------------------------------------

TITLE: Generic models
DESCRIPTION: You can also create a generic subclass of a model that partially or fully replaces the type variables in the superclass:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from typing import Generic, TypeVarfrom pydantic import BaseModelTypeX = TypeVar('TypeX')TypeY = TypeVar('TypeY')TypeZ = TypeVar('TypeZ')class BaseClass(BaseModel, Generic[TypeX, TypeY]):    x: TypeX    y: TypeYclass ChildClass(BaseClass[int, TypeY], Generic[TypeY, TypeZ]):    z: TypeZ# Parametrize `TypeY` with `str`:print(ChildClass[str, int](x='1', y='y', z='3'))#> x=1 y='y' z=3
```

----------------------------------------

TITLE: Generic models
DESCRIPTION: If the name of the concrete subclasses is important, you can also override the default name generation by overriding the [`model_parametrized_name()`](https://pydantic.dev/docs/validation/2.10/api/pydantic/base_model/#pydantic.BaseModel.model_parametrized_name) method:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from typing import Any, Generic, Tuple, Type, TypeVarfrom pydantic import BaseModelDataT = TypeVar('DataT')class Response(BaseModel, Generic[DataT]):    data: DataT    @classmethod    def model_parametrized_name(cls, params: Tuple[Type[Any], ...]) -> str:        return f'{params[0].__name__.title()}Response'print(repr(Response[int](data=1)))#> IntResponse(data=1)print(repr(Response[str](data='a')))#> StrResponse(data='a')
```

----------------------------------------

TITLE: Generic models
DESCRIPTION: You can use parametrized generic models as types in other models:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from typing import Generic, TypeVarfrom pydantic import BaseModelT = TypeVar('T')class ResponseModel(BaseModel, Generic[T]):    content: Tclass Product(BaseModel):    name: str    price: floatclass Order(BaseModel):    id: int    product: ResponseModel[Product]product = Product(name='Apple', price=0.5)response = ResponseModel[Product](content=product)order = Order(id=1, product=response)print(repr(order))"""Order(id=1, product=ResponseModel[Product](content=Product(name='Apple', price=0.5)))"""
```

----------------------------------------

TITLE: Generic models
DESCRIPTION: Using the same type variable in nested models allows you to enforce typing relationships at different points in your model:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from typing import Generic, TypeVarfrom pydantic import BaseModel, ValidationErrorT = TypeVar('T')class InnerT(BaseModel, Generic[T]):  inner: Tclass OuterT(BaseModel, Generic[T]):  outer: T  nested: InnerT[T]nested = InnerT[int](inner=1)print(OuterT[int](outer=1, nested=nested))#> outer=1 nested=InnerT[int](inner=1)try:  print(OuterT[int](outer='a', nested=InnerT(inner='a')))  except ValidationError as e:  print(e)  """  2 validation errors for OuterT[int]  outer    Input should be a valid integer, unable to parse string as an integer [type=int_parsing, input_value='a', input_type=str]  nested.inner    Input should be a valid integer, unable to parse string as an integer [type=int_parsing, input_value='a', input_type=str]  """
```

----------------------------------------

TITLE: Validation of unparametrized type variables
DESCRIPTION: For unbound or unconstrained type variables, Pydantic will fallback to `Any`.
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from typing import Genericfrom typing_extensions import TypeVarfrom pydantic import BaseModel, ValidationErrorT = TypeVar('T')U = TypeVar('U', bound=int)V = TypeVar('V', default=str)class Model(BaseModel, Generic[T, U, V]):    t: T    u: U    v: Vprint(Model(t='t', u=1, v='v'))#> t='t' u=1 v='v'try:    Model(t='t', u='u', v=1)except ValidationError as exc:    print(exc)    """    2 validation errors for Model    u      Input should be a valid integer, unable to parse string as an integer [type=int_parsing, input_value='u', input_type=str]    v      Input should be a valid string [type=string_type, input_value=1, input_type=int]    """
```

----------------------------------------

TITLE: Validation of unparametrized type variables
DESCRIPTION: 
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from typing import Generic, TypeVarfrom pydantic import BaseModelItemT = TypeVar('ItemT', bound='ItemBase')class ItemBase(BaseModel): ...class IntItem(ItemBase):  value: intclass ItemHolder(BaseModel, Generic[ItemT]):  item: ItemTloaded_data = {'item': {'value': 1}}print(ItemHolder(**loaded_data))  #> item=ItemBase()print(ItemHolder[IntItem](**loaded_data))  #> item=IntItem(value=1)
```

----------------------------------------

TITLE: Serialization of unparametrized type variables
DESCRIPTION: If a Pydantic model is used in a type variable upper bound and the type variable is never parametrized, then Pydantic will use the upper bound for validation but treat the value as `Any` in terms of serialization:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from typing import Generic, TypeVarfrom pydantic import BaseModelclass ErrorDetails(BaseModel):    foo: strErrorDataT = TypeVar('ErrorDataT', bound=ErrorDetails)class Error(BaseModel, Generic[ErrorDataT]):    message: str    details: ErrorDataTclass MyErrorDetails(ErrorDetails):    bar: str# serialized as Anyerror = Error(    message='We just had an error',    details=MyErrorDetails(foo='var', bar='var2'),)assert error.model_dump() == {    'message': 'We just had an error',    'details': {        'foo': 'var',        'bar': 'var2',    },}# serialized using the concrete parametrization# note that `'bar': 'var2'` is missingerror = Error[ErrorDetails](    message='We just had an error',    details=ErrorDetails(foo='var'),)assert error.model_dump() == {    'message': 'We just had an error',    'details': {        'foo': 'var',    },}
```

----------------------------------------

TITLE: Serialization of unparametrized type variables
DESCRIPTION: Here’s another example of the above behavior, enumerating all permutations regarding bound specification and generic type parametrization:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from typing import Generic, TypeVarfrom pydantic import BaseModelTBound = TypeVar('TBound', bound=BaseModel)TNoBound = TypeVar('TNoBound')class IntValue(BaseModel):    value: intclass ItemBound(BaseModel, Generic[TBound]):    item: TBoundclass ItemNoBound(BaseModel, Generic[TNoBound]):    item: TNoBounditem_bound_inferred = ItemBound(item=IntValue(value=3))item_bound_explicit = ItemBound[IntValue](item=IntValue(value=3))item_no_bound_inferred = ItemNoBound(item=IntValue(value=3))item_no_bound_explicit = ItemNoBound[IntValue](item=IntValue(value=3))# calling `print(x.model_dump())` on any of the above instances results in the following:#> {'item': {'value': 3}}
```

----------------------------------------

TITLE: Serialization of unparametrized type variables
DESCRIPTION: However, if [constraints](https://typing.readthedocs.io/en/latest/reference/generics.html#type-variables-with-constraints) or a default value (as per [PEP 696](https://peps.python.org/pep-0696/)) is being used, then the default type or constraints will be used for both validation and serialization if the type variable is not parametrized. You can override this behavior using [`SerializeAsAny`](https://pydantic.dev/docs/validation/2.10/concepts/serialization#serializeasany-annotation):
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from typing import Genericfrom typing_extensions import TypeVarfrom pydantic import BaseModel, SerializeAsAnyclass ErrorDetails(BaseModel):    foo: strErrorDataT = TypeVar('ErrorDataT', default=ErrorDetails)class Error(BaseModel, Generic[ErrorDataT]):    message: str    details: ErrorDataTclass MyErrorDetails(ErrorDetails):    bar: str# serialized using the default's serializererror = Error(    message='We just had an error',    details=MyErrorDetails(foo='var', bar='var2'),)assert error.model_dump() == {    'message': 'We just had an error',    'details': {        'foo': 'var',    },}# If `ErrorDataT` was using an upper bound, `bar` would be present in `details`.class SerializeAsAnyError(BaseModel, Generic[ErrorDataT]):    message: str    details: SerializeAsAny[ErrorDataT]# serialized as Anyerror = SerializeAsAnyError(    message='We just had an error',    details=MyErrorDetails(foo='var', bar='baz'),)assert error.model_dump() == {    'message': 'We just had an error',    'details': {        'foo': 'var',        'bar': 'baz',    },}
```

----------------------------------------

TITLE: Dynamic model creation
DESCRIPTION: There are some occasions where it is desirable to create a model using runtime information to specify the fields. For this Pydantic provides the `create_model` function to allow models to be created on the fly:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from pydantic import BaseModel, create_modelDynamicFoobarModel = create_model(    'DynamicFoobarModel', foo=(str, ...), bar=(int, 123))class StaticFoobarModel(BaseModel):    foo: str    bar: int = 123
```

----------------------------------------

TITLE: Dynamic model creation
DESCRIPTION: Using a `Field(...)` call as the second argument in the tuple (the default value) allows for more advanced field configuration. Thus, the following are analogous:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from pydantic import BaseModel, Field, create_modelDynamicModel = create_model(    'DynamicModel',    foo=(str, Field(description='foo description', alias='FOO')),)class StaticModel(BaseModel):    foo: str = Field(description='foo description', alias='FOO')
```

----------------------------------------

TITLE: Dynamic model creation
DESCRIPTION: The special keyword arguments `__config__` and `__base__` can be used to customize the new model. This includes extending a base model with extra fields.
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from pydantic import BaseModel, create_modelclass FooModel(BaseModel):    foo: str    bar: int = 123BarModel = create_model(    'BarModel',    apple=(str, 'russet'),    banana=(str, 'yellow'),    __base__=FooModel,)print(BarModel)#> <class '__main__.BarModel'>print(BarModel.model_fields.keys())#> dict_keys(['foo', 'bar', 'apple', 'banana'])
```

----------------------------------------

TITLE: Dynamic model creation
DESCRIPTION: You can also add validators by passing a dictionary to the `__validators__` argument.
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from pydantic import ValidationError, create_model, field_validatordef alphanum(cls, v):  assert v.isalnum(), 'must be alphanumeric'  return vvalidators = {  'username_validator': field_validator('username')(alphanum)  }UserModel = create_model(  'UserModel', username=(str, ...), __validators__=validators)user = UserModel(username='scolvin')print(user)#> username='scolvin'try:  UserModel(username='scolvi%n')except ValidationError as e:  print(e)  """  1 validation error for UserModel  username    Assertion failed, must be alphanumeric [type=assertion_error, input_value='scolvi%n', input_type=str]  """
```

----------------------------------------

TITLE: `RootModel` and custom root types
DESCRIPTION: Here’s an example of how this works:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from typing import Dict, Listfrom pydantic import RootModelPets = RootModel[List[str]]PetsByName = RootModel[Dict[str, str]]print(Pets(['dog', 'cat']))#> root=['dog', 'cat']print(Pets(['dog', 'cat']).model_dump_json())#> ["dog","cat"]print(Pets.model_validate(['dog', 'cat']))#> root=['dog', 'cat']print(Pets.model_json_schema())"""{'items': {'type': 'string'}, 'title': 'RootModel[List[str]]', 'type': 'array'}"""print(PetsByName({'Otis': 'dog', 'Milo': 'cat'}))#> root={'Otis': 'dog', 'Milo': 'cat'}print(PetsByName({'Otis': 'dog', 'Milo': 'cat'}).model_dump_json())#> {"Otis":"dog","Milo":"cat"}print(PetsByName.model_validate({'Otis': 'dog', 'Milo': 'cat'}))#> root={'Otis': 'dog', 'Milo': 'cat'}
```

----------------------------------------

TITLE: `RootModel` and custom root types
DESCRIPTION: If you want to access items in the `root` field directly or to iterate over the items, you can implement custom `__iter__` and `__getitem__` functions, as shown in the following example.
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from typing import Listfrom pydantic import RootModelclass Pets(RootModel):    root: List[str]    def __iter__(self):        return iter(self.root)    def __getitem__(self, item):        return self.root[item]pets = Pets.model_validate(['dog', 'cat'])print(pets[0])#> dogprint([pet for pet in pets])#> ['dog', 'cat']
```

----------------------------------------

TITLE: `RootModel` and custom root types
DESCRIPTION: You can also create subclasses of the parametrized root model directly:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from typing import Listfrom pydantic import RootModelclass Pets(RootModel[List[str]]):    def describe(self) -> str:        return f'Pets: {", ".join(self.root)}'my_pets = Pets.model_validate(['dog', 'cat'])print(my_pets.describe())#> Pets: dog, cat
```

----------------------------------------

TITLE: Faux immutability
DESCRIPTION: Models can be configured to be immutable via `model_config['frozen'] = True`. When this is set, attempting to change the values of instance attributes will raise errors. See the [API reference](https://pydantic.dev/docs/validation/2.10/api/pydantic/config/#pydantic.config.ConfigDict.frozen) for more details.
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from pydantic import BaseModel, ConfigDict, ValidationErrorclass FooBarModel(BaseModel):    model_config = ConfigDict(frozen=True)    a: str    b: dictfoobar = FooBarModel(a='hello', b={'apple': 'pear'})try:    foobar.a = 'different'except ValidationError as e:    print(e)    """    1 validation error for FooBarModel    a      Instance is frozen [type=frozen_instance, input_value='different', input_type=str]    """print(foobar.a)#> helloprint(foobar.b)#> {'apple': 'pear'}foobar.b['apple'] = 'grape'print(foobar.b)#> {'apple': 'grape'}
```

----------------------------------------

TITLE: Abstract base classes
DESCRIPTION: Pydantic models can be used alongside Python’s [Abstract Base Classes](https://docs.python.org/3/library/abc.html) (ABCs).
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
import abcfrom pydantic import BaseModelclass FooBarModel(BaseModel, abc.ABC):    a: str    b: int    @abc.abstractmethod    def my_abstract_method(self):        pass
```

----------------------------------------

TITLE: Field ordering
DESCRIPTION: field order is preserved by [`.model_dump()` and `.model_dump_json()` etc.](https://pydantic.dev/docs/validation/2.10/concepts/serialization#model_dump)
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from pydantic import BaseModel, ValidationErrorclass Model(BaseModel):    a: int    b: int = 2    c: int = 1    d: int = 0    e: floatprint(Model.model_fields.keys())#> dict_keys(['a', 'b', 'c', 'd', 'e'])m = Model(e=2, a=1)print(m.model_dump())#> {'a': 1, 'b': 2, 'c': 1, 'd': 0, 'e': 2.0}try:    Model(a='x', b='x', c='x', d='x', e='x')except ValidationError as err:    error_locations = [e['loc'] for e in err.errors()]print(error_locations)#> [('a',), ('b',), ('c',), ('d',), ('e',)]
```

----------------------------------------

TITLE: Required fields
DESCRIPTION: To declare a field as required, you may declare it using an annotation, or an annotation in combination with a [`Field`](https://pydantic.dev/docs/validation/2.10/api/pydantic/fields/#pydantic.fields.Field) function (without specifying any `default` or `default_factory` argument).
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from pydantic import BaseModel, Fieldclass Model(BaseModel):    a: int    b: int = Field(alias='B')    c: int = Field(..., alias='C')
```

----------------------------------------

TITLE: Fields with non-hashable default values
DESCRIPTION: Pydantic also supports the use of a `default_factory` for non-hashable default values, but it is not required. In the event that the default value is not hashable, Pydantic will deepcopy the default value when creating each instance of the model:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from typing import Dict, Listfrom pydantic import BaseModelclass Model(BaseModel):    item_counts: List[Dict[str, int]] = [{}]m1 = Model()m1.item_counts[0]['a'] = 1print(m1.item_counts)#> [{'a': 1}]m2 = Model()print(m2.item_counts)#> [{}]
```

----------------------------------------

TITLE: Fields with dynamic default values
DESCRIPTION: Here is an example:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from datetime import datetime, timezonefrom uuid import UUID, uuid4from pydantic import BaseModel, Fielddef datetime_now() -> datetime:    return datetime.now(timezone.utc)class Model(BaseModel):    uid: UUID = Field(default_factory=uuid4)    updated: datetime = Field(default_factory=datetime_now)m1 = Model()m2 = Model()assert m1.uid != m2.uid
```

----------------------------------------

TITLE: Class vars
DESCRIPTION: Attributes annotated with `typing.ClassVar` are properly treated by Pydantic as class variables, and will not become fields on model instances:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from typing import ClassVarfrom pydantic import BaseModelclass Model(BaseModel):    x: int = 2    y: ClassVar[int] = 1m = Model()print(m)#> x=2print(Model.y)#> 1
```

----------------------------------------

TITLE: Private model attributes
DESCRIPTION: Here is an example of usage:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from datetime import datetimefrom random import randintfrom pydantic import BaseModel, PrivateAttrclass TimeAwareModel(BaseModel):    _processed_at: datetime = PrivateAttr(default_factory=datetime.now)    _secret_value: str    def __init__(self, **data):        super().__init__(**data)        # this could also be done with default_factory        self._secret_value = randint(1, 5)m = TimeAwareModel()print(m._processed_at)#> 2032-01-02 03:04:05.000006print(m._secret_value)#> 3
```

----------------------------------------

TITLE: Data conversion
DESCRIPTION: Pydantic may cast input data to force it to conform to model field types, and in some cases this may result in a loss of information. For example:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from pydantic import BaseModelclass Model(BaseModel):    a: int    b: float    c: strprint(Model(a=3.000, b='2.72', c=b'binary data').model_dump())#> {'a': 3, 'b': 2.72, 'c': 'binary data'}
```

----------------------------------------

TITLE: Model signature
DESCRIPTION: All Pydantic models will have their signature generated based on their fields:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
import inspectfrom pydantic import BaseModel, Fieldclass FooModel(BaseModel):    id: int    name: str = None    description: str = 'Foo'    apple: int = Field(alias='pear')print(inspect.signature(FooModel))#> (*, id: int, name: str = None, description: str = 'Foo', pear: int) -> None
```

----------------------------------------

TITLE: Model signature
DESCRIPTION: The generated signature will also respect custom `__init__` functions:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
import inspectfrom pydantic import BaseModelclass MyModel(BaseModel):    id: int    info: str = 'Foo'    def __init__(self, id: int = 1, *, bar: str, **data) -> None:        """My custom init!"""        super().__init__(id=id, bar=bar, **data)print(inspect.signature(MyModel))#> (id: int = 1, *, bar: str, info: str = 'Foo') -> None
```

----------------------------------------

TITLE: Structural pattern matching
DESCRIPTION: Pydantic supports structural pattern matching for models, as introduced by [PEP 636](https://peps.python.org/pep-0636/) in Python 3.10.
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from pydantic import BaseModelclass Pet(BaseModel):    name: str    species: stra = Pet(name='Bones', species='dog')match a:    # match `species` to 'dog', declare and initialize `dog_name`    case Pet(species='dog', name=dog_name):        print(f'{dog_name} is a dog')#> Bones is a dog    # default case    case _:        print('No dog matched')
```

----------------------------------------

TITLE: Attribute copies
DESCRIPTION: In this example, note that the ID of the list changes after the class is constructed because it has been copied during validation:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from typing import Listfrom pydantic import BaseModelclass C1:    arr = []    def __init__(self, in_arr):        self.arr = in_arrclass C2(BaseModel):    arr: List[int]arr_orig = [1, 9, 10, 3]c1 = C1(arr_orig)c2 = C2(arr=arr_orig)print('id(c1.arr) == id(c2.arr):', id(c1.arr) == id(c2.arr))#> id(c1.arr) == id(c2.arr): False
```

----------------------------------------

TITLE: Extra fields
DESCRIPTION: By default, Pydantic models won’t error when you provide data for unrecognized fields, they will just be ignored:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from pydantic import BaseModelclass Model(BaseModel):    x: intm = Model(x=1, y='a')assert m.model_dump() == {'x': 1}
```

----------------------------------------

TITLE: Extra fields
DESCRIPTION: If you want this to raise an error, you can set the [`extra`](https://pydantic.dev/docs/validation/2.10/api/pydantic/config/#pydantic.config.ConfigDict.extra) configuration value to `'forbid'`:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from pydantic import BaseModel, ConfigDict, ValidationErrorclass Model(BaseModel):    x: int    model_config = ConfigDict(extra='forbid')try:    Model(x=1, y='a')except ValidationError as exc:    print(exc)    """    1 validation error for Model    y      Extra inputs are not permitted [type=extra_forbidden, input_value='a', input_type=str]    """
```

----------------------------------------

TITLE: Extra fields
DESCRIPTION: To instead preserve any extra data provided, you can set [`extra`](https://pydantic.dev/docs/validation/2.10/api/pydantic/config/#pydantic.config.ConfigDict.extra) to `'allow'`. The extra fields will then be stored in `BaseModel.__pydantic_extra__`:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from pydantic import BaseModel, ConfigDictclass Model(BaseModel):    x: int    model_config = ConfigDict(extra='allow')m = Model(x=1, y='a')assert m.__pydantic_extra__ == {'y': 'a'}
```

----------------------------------------

TITLE: Extra fields
DESCRIPTION: By default, no validation will be applied to these extra items, but you can set a type for the values by overriding the type annotation for `__pydantic_extra__`:
SOURCE: https://docs.pydantic.dev/2.10/concepts/models/
LANGUAGE: python
CODE:
```python
from typing import Dictfrom pydantic import BaseModel, ConfigDict, Field, ValidationErrorclass Model(BaseModel):  __pydantic_extra__: Dict[str, int] = Field(init=False)    x: int  model_config = ConfigDict(extra='allow')try:  Model(x=1, y='a')except ValidationError as exc:  print(exc)  """  1 validation error for Model  y    Input should be a valid integer, unable to parse string as an integer [type=int_parsing, input_value='a', input_type=str]  """m = Model(x=1, y='2')assert m.x == 1assert m.y == 2assert m.model_dump() == {'x': 1, 'y': 2}assert m.__pydantic_extra__ == {'y': 2}
```

----------------------------------------
<<<DEVFLOW_STACK_REF_END>>>
